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
    console.log('Login Response:', data); // Log the full response
    // Ensure we store only the token string
    const token = typeof data === 'string' ? data : data.token;
    if (!token) throw new Error('No token found in response');
    localStorage.setItem('jwt', token);
    console.log('Stored JWT:', localStorage.getItem('jwt')); // Log what’s stored
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

  try {
    // Fetch user info
    const userData = await fetchGraphQL(jwt, `
      {
        user {
          id
          login
        }
      }
    `);
    console.log('Raw User Data Response:', userData);
    if (!userData.data?.user) throw new Error('User data not found or empty');
    const user = Array.isArray(userData.data.user) ? userData.data.user[0] : userData.data.user;
    document.getElementById('username').textContent = user.login || 'N/A';

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

    // Fetch pass/fail data
    const resultData = await fetchGraphQL(jwt, `
      {
        result {
          grade
        }
      }
    `);
    const results = resultData.data?.result || [];
    const passes = results.filter(r => r.grade === 1).length;
    const fails = results.filter(r => r.grade === 0).length;
    const ratio = passes / (passes + fails) || 0;
    document.getElementById('pass-fail-ratio').textContent = `${(ratio * 100).toFixed(2)}%`;

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

    // Fetch audit data
    const auditData = await fetchGraphQL(jwt, `
      {
        received: transaction_aggregate(where: { type: { _eq: "down" } }) {
          aggregate {
            count
          }
        }
        given: transaction_aggregate(where: { type: { _eq: "up" } }) {
          aggregate {
            count
          }
        }
        allTransactions: transaction {
          id
          type
          amount
          path
          createdAt
        }
      }
    `);
    console.log('Raw Audit Data Response:', auditData);
    renderAuditRatio({
      received: auditData.data?.received?.aggregate?.count || 0,
      given: auditData.data?.given?.aggregate?.count || 0
    });

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
  const paddingTopBottom = 50; // Padding for top and bottom
  const paddingLeft = 80; // Increased left padding for labels
  const paddingRight = 50; // Right padding
  const minDate = new Date(Math.min(...data.map(d => d.date)));
  const maxDate = new Date(Math.max(...data.map(d => d.date)));
  const maxXP = Math.max(...data.map(d => d.xp));
  const xScale = (date) => ((date - minDate) / (maxDate - minDate)) * (width - paddingLeft - paddingRight) + paddingLeft;
  const yScale = (xp) => height - paddingTopBottom - (xp / maxXP) * (height - 2 * paddingTopBottom);

  // Draw line
  const path = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xScale(d.date)},${yScale(d.xp)}`).join(' ');
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  line.setAttribute('d', path);
  line.setAttribute('class', 'graph-line');
  svg.appendChild(line);

  // Draw X-axis
  const xAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  xAxis.setAttribute('x1', paddingLeft);
  xAxis.setAttribute('y1', height - paddingTopBottom);
  xAxis.setAttribute('x2', width - paddingRight);
  xAxis.setAttribute('y2', height - paddingTopBottom);
  xAxis.setAttribute('class', 'graph-axis');
  svg.appendChild(xAxis);

  // Draw Y-axis
  const yAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  yAxis.setAttribute('x1', paddingLeft);
  yAxis.setAttribute('y1', paddingTopBottom);
  yAxis.setAttribute('x2', paddingLeft);
  yAxis.setAttribute('y2', height - paddingTopBottom);
  yAxis.setAttribute('class', 'graph-axis');
  svg.appendChild(yAxis);

  // Y-axis ticks and labels
  const yTicks = 5;
  for (let i = 0; i <= yTicks; i++) {
    const y = height - paddingTopBottom - (i / yTicks) * (height - 2 * paddingTopBottom);
    const value = (i / yTicks) * maxXP;

    // Draw tick mark
    const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    tick.setAttribute('x1', paddingLeft - 5); // Tick starts slightly left of Y-axis
    tick.setAttribute('y1', y);
    tick.setAttribute('x2', paddingLeft); // Tick ends at Y-axis
    tick.setAttribute('y2', y);
    tick.setAttribute('class', 'graph-axis');
    svg.appendChild(tick);

    // Draw label with more space from the left edge
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', paddingLeft - 10); // Adjusted to ensure visibility (closer to Y-axis but still left)
    label.setAttribute('y', y + 5); // Slight vertical offset
    label.setAttribute('text-anchor', 'end'); // Text ends at this x position
    label.setAttribute('class', 'graph-label');
    label.textContent = Math.round(value).toString();
    svg.appendChild(label);
  }

  // X-axis ticks and labels
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

// Render Audit Ratio as a pie chart
function renderAuditRatio(auditData) {
  const svg = document.getElementById('xp-per-project');
  svg.innerHTML = '';

  const { received, given } = auditData;
  const total = received + given;

  if (total === 0) {
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', '50%');
    text.setAttribute('y', '50%');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('class', 'graph-label');
    text.textContent = 'No Audit Data Available';
    svg.appendChild(text);
    return;
  }

  const width = 500;
  const height = 300;
  const radius = Math.min(width, height) / 2 - 50;
  const centerX = width / 2;
  const centerY = height / 2;

  const angles = {
    received: (received / total) * 2 * Math.PI,
    given: (given / total) * 2 * Math.PI
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
    path.setAttribute('class', 'graph-bar'); // Use graph-bar for styling
    svg.appendChild(path);
  }

  const startAngleReceived = 0;
  const endAngleReceived = angles.received;
  createArc(startAngleReceived, endAngleReceived, '#0ff'); // Cyan for received

  const startAngleGiven = endAngleReceived;
  const endAngleGiven = startAngleGiven + angles.given;
  createArc(startAngleGiven, endAngleGiven, '#f0f'); // Magenta for given

  const labelData = [
    { name: 'Received', value: received, angle: angles.received / 2 },
    { name: 'Given', value: given, angle: startAngleGiven + angles.given / 2 }
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