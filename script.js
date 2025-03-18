const loginSection = document.getElementById('login-section');
const profileSection = document.getElementById('profile-section');
const errorMessage = document.getElementById('error-message');
const logoutButton = document.getElementById('logout-button');

// Check if JWT exists on page load
if (localStorage.getItem('jwt')) {
  showProfile();
} else {
  showLogin();
}

// Login form submission
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const usernameOrEmail = document.getElementById('usernameOrEmail').value;
  const password = document.getElementById('password').value;
  const credentials = btoa(`${usernameOrEmail}:${password}`);

  try {
    const response = await fetch('https://learn.reboot01.com/api/auth/signin', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`
      }
    });

    if (!response.ok) throw new Error('Invalid credentials');

    const data = await response.json();
    console.log('Login Response:', data);
    const token = typeof data === 'string' ? data : data.token;
    if (!token) throw new Error('No token found in response');
    localStorage.setItem('jwt', token);
    console.log('Stored JWT:', localStorage.getItem('jwt'));
    showProfile();
  } catch (error) {
    console.error('Login Error:', error.message);
    errorMessage.style.display = 'block';
  }
});

// Logout
logoutButton.addEventListener('click', () => {
  localStorage.removeItem('jwt');
  showLogin();
});

// Show login section
function showLogin() {
  loginSection.style.display = 'block';
  profileSection.style.display = 'none';
}

function decodeJwtPayload(token) {
  try {
    const base64Url = token.split('.')[1]; // Get the payload (second part)
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/'); // Convert base64url to base64
    const jsonPayload = atob(base64); // Decode base64 to string
    return JSON.parse(jsonPayload); // Parse to JSON
  } catch (error) {
    console.error('Error decoding JWT:', error);
    return null;
  }
} 

// Show profile section and fetch data
async function showProfile() {
  loginSection.style.display = 'none';
  profileSection.style.display = 'block';

  const jwt = localStorage.getItem('jwt');
  if (!jwt) {
    console.log('No JWT found, showing login');
    showLogin();
    return;
  }

  // Decode JWT to get user ID
  const payload = decodeJwtPayload(jwt);
  if (!payload || !payload.sub) {
    console.error('Invalid JWT payload or missing user ID');
    localStorage.removeItem('jwt');
    showLogin();
    return;
  }
  const userId = payload.sub; // Use 'sub' as the user ID field; adjust if different

  try {
    // Fetch user info using the authenticated user's ID
    const userData = await fetchGraphQL(jwt, `
      {
        user(where: {id: {_eq: "${userId}"}}) {
          id
          login
          email
          firstName
          lastName
          campus
          auditRatio
          auditsAssigned
          attrs
          records {
            id
          }
        }
      }
    `);
    console.log('Raw User Data Response:', userData);
    if (!userData.data?.user?.length) throw new Error('User data not found or empty');
    const user = userData.data.user[0]; // Single user matching the ID
    document.getElementById('user-id').textContent = user.id || 'N/A';
    document.getElementById('username').textContent = user.login || 'N/A';
    document.getElementById('email').textContent = user.email || 'N/A';
    document.getElementById('first-name').textContent = user.firstName || 'N/A';
    document.getElementById('last-name').textContent = user.lastName || 'N/A';
    document.getElementById('campus').textContent = user.campus || 'N/A';
    document.getElementById('audits-assigned').textContent = user.auditsAssigned || 0;
    document.getElementById('records-count').textContent = user.records?.length || 0;

    // Handle attributes
    const attrsContainer = document.getElementById('attributes');
    attrsContainer.innerHTML = '<strong>Attributes:</strong>';
    if (user.attrs && typeof user.attrs === 'object') {
      Object.entries(user.attrs).forEach(([key, value]) => {
        if (['email', 'firstName', 'lastName', 'id-cardUploadId', 'pro-picUploadId'].includes(key)) return;
        const p = document.createElement('p');
        p.innerHTML = `<span class="attr-key">${key}:</span> <span class="attr-value">${value || 'N/A'}</span>`;
        attrsContainer.appendChild(p);
      });
    } else {
      const p = document.createElement('p');
      p.textContent = 'N/A';
      attrsContainer.appendChild(p);
    }

    // Fetch total XP
    const xpData = await fetchGraphQL(jwt, `
      {
        transaction_aggregate(where: { type: { _eq: "xp" } }) {
          aggregate {
            sum {
              amount
            }
          }
        }
      }
    `);
    const totalXP = xpData.data?.transaction_aggregate?.aggregate?.sum?.amount || 0;
    document.getElementById('total-xp').textContent = totalXP;

    // Fetch XP over time
    const xpOverTimeData = await fetchGraphQL(jwt, `
      {
        transaction(where: { type: { _eq: "xp" } }, order_by: { createdAt: asc }) {
          amount
          createdAt
        }
      }
    `);
    renderXpOverTime(xpOverTimeData.data?.transaction || []);

    // Render audit ratio
    renderAuditRatio({ auditRatio: user.auditRatio || 0 });

  } catch (error) {
    console.error('Error in showProfile:', error.message);
    if (error.message.includes('Failed to fetch data')) {
      localStorage.removeItem('jwt');
      showLogin();
    }
  }
}

// Helper function to fetch GraphQL data
async function fetchGraphQL(jwt, query) {
  const response = await fetch('https://learn.reboot01.com/api/graphql-engine/v1/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwt}`
    },
    body: JSON.stringify({ query })
  });

  if (!response.ok) throw new Error('Failed to fetch data');
  return response.json();
}

// Render XP over time graph (line graph)
function renderXpOverTime(transactions) {
  const svg = document.getElementById('xp-over-time');
  svg.innerHTML = '';

  if (transactions.length === 0) {
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', '50%');
    text.setAttribute('y', '50%');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('class', 'graph-label');
    text.textContent = 'No XP Data Available';
    svg.appendChild(text);
    return;
  }

  let cumulativeXP = 0;
  const data = transactions.map(t => {
    cumulativeXP += t.amount;
    return { date: new Date(t.createdAt), xp: cumulativeXP };
  });

  const width = 500;
  const height = 300;
  const paddingTopBottom = 50;
  const paddingLeft = 80;
  const paddingRight = 50;
  const minDate = new Date(Math.min(...data.map(d => d.date)));
  const maxDate = new Date(Math.max(...data.map(d => d.date)));
  const maxXP = Math.max(...data.map(d => d.xp));
  const xScale = (date) => ((date - minDate) / (maxDate - minDate)) * (width - paddingLeft - paddingRight) + paddingLeft;
  const yScale = (xp) => height - paddingTopBottom - (xp / maxXP) * (height - 2 * paddingTopBottom);

  const path = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xScale(d.date)},${yScale(d.xp)}`).join(' ');
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  line.setAttribute('d', path);
  line.setAttribute('class', 'graph-line');
  svg.appendChild(line);

  const xAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  xAxis.setAttribute('x1', paddingLeft);
  xAxis.setAttribute('y1', height - paddingTopBottom);
  xAxis.setAttribute('x2', width - paddingRight);
  xAxis.setAttribute('y2', height - paddingTopBottom);
  xAxis.setAttribute('class', 'graph-axis');
  svg.appendChild(xAxis);

  const yAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  yAxis.setAttribute('x1', paddingLeft);
  yAxis.setAttribute('y1', paddingTopBottom);
  yAxis.setAttribute('x2', paddingLeft);
  yAxis.setAttribute('y2', height - paddingTopBottom);
  yAxis.setAttribute('class', 'graph-axis');
  svg.appendChild(yAxis);

  const yTicks = 5;
  for (let i = 0; i <= yTicks; i++) {
    const y = height - paddingTopBottom - (i / yTicks) * (height - 2 * paddingTopBottom);
    const value = (i / yTicks) * maxXP;
    const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    tick.setAttribute('x1', paddingLeft - 5);
    tick.setAttribute('y1', y);
    tick.setAttribute('x2', paddingLeft);
    tick.setAttribute('y2', y);
    tick.setAttribute('class', 'graph-axis');
    svg.appendChild(tick);

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', paddingLeft - 10);
    label.setAttribute('y', y + 5);
    label.setAttribute('text-anchor', 'end');
    label.setAttribute('class', 'graph-label');
    label.textContent = Math.round(value).toString();
    svg.appendChild(label);
  }

  const xTicks = 5;
  for (let i = 0; i <= xTicks; i++) {
    const x = paddingLeft + (i / xTicks) * (width - paddingLeft - paddingRight);
    const date = new Date(minDate.getTime() + (i / xTicks) * (maxDate - minDate));
    const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    tick.setAttribute('x1', x);
    tick.setAttribute('y1', height - paddingTopBottom);
    tick.setAttribute('x2', x);
    tick.setAttribute('y2', height - paddingTopBottom + 5);
    tick.setAttribute('class', 'graph-axis');
    svg.appendChild(tick);

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', x);
    label.setAttribute('y', height - paddingTopBottom + 20);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'graph-label');
    label.textContent = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    svg.appendChild(label);
  }
}

// Render Audit Ratio as a pie chart using auditRatio
function renderAuditRatio(data) {
  const svg = document.getElementById('xp-per-project');
  svg.innerHTML = '';

  const auditRatio = data.auditRatio;
  if (auditRatio === 0) {
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', '50%');
    text.setAttribute('y', '50%');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('class', 'graph-label');
    text.textContent = 'No Audit Ratio Available';
    svg.appendChild(text);
    return;
  }

  const width = 500;
  const height = 300;
  const radius = Math.min(width, height) / 2 - 50;
  const centerX = width / 2;
  const centerY = height / 2;

  const angles = {
    ratio: auditRatio * 2 * Math.PI,
    remaining: (1 - auditRatio) * 2 * Math.PI
  };

  function createArc(startAngle, endAngle, color) {
    const startX = centerX + radius * Math.cos(startAngle);
    const startY = centerY + radius * Math.sin(startAngle);
    const endX = centerX + radius * Math.cos(endAngle);
    const endY = centerY + radius * Math.sin(endAngle);
    const largeArcFlag = endAngle - startAngle <= Math.PI ? 0 : 1;

    const d = [
      `M ${centerX},${centerY}`,
      `L ${startX},${startY}`,
      `A ${radius},${radius} 0 ${largeArcFlag} 1 ${endX},${endY}`,
      'Z'
    ].join(' ');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', color);
    path.setAttribute('class', 'graph-bar');
    svg.appendChild(path);
  }

  const startAngleRatio = 0;
  const endAngleRatio = angles.ratio;
  createArc(startAngleRatio, endAngleRatio, '#0ff');

  const startAngleRemaining = endAngleRatio;
  const endAngleRemaining = startAngleRemaining + angles.remaining;
  createArc(startAngleRemaining, endAngleRemaining, '#f0f');

  const labelData = [
    { name: 'Audit Ratio', value: `${(auditRatio * 100).toFixed(2)}%`, angle: angles.ratio / 2 },
    { name: 'Remaining', value: `${((1 - auditRatio) * 100).toFixed(2)}%`, angle: startAngleRemaining + angles.remaining / 2 }
  ];

  labelData.forEach(data => {
    const labelX = centerX + (radius * 0.7) * Math.cos(data.angle);
    const labelY = centerY + (radius * 0.7) * Math.sin(data.angle);
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', labelX);
    text.setAttribute('y', labelY);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('class', 'graph-label');
    text.textContent = `${data.name}: ${data.value}`;
    svg.appendChild(text);
  });
}