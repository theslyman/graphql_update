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
    localStorage.setItem('jwt', data.token);
    showProfile();
  } catch (error) {
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
    console.log('User Data:', userData);
    if (!userData.data?.user?.[0]?.login) throw new Error('User data not found');
    document.getElementById('username').textContent = userData.data.user[0].login || 'N/A';

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
    console.log('XP Data:', xpData);
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
    console.log('Result Data:', resultData);
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
    console.log('XP Over Time Data:', xpOverTimeData);
    renderXpOverTime(xpOverTimeData.data?.transaction || []);

    // Fetch XP per project
    const xpPerProjectData = await fetchGraphQL(jwt, `
      {
        transaction(where: { type: { _eq: "xp" } }) {
          amount
          object {
            name
          }
        }
      }
    `);
    console.log('XP Per Project Data:', xpPerProjectData);
    renderXpPerProject(xpPerProjectData.data?.transaction || []);

  } catch (error) {
    console.error('Error in showProfile:', error.message);
    // Only revert to login if JWT is invalid
    if (error.message.includes('Failed to fetch data')) {
      console.log('JWT likely invalid, clearing and showing login');
      localStorage.removeItem('jwt');
      showLogin();
    } else {
      console.log('Keeping profile visible with partial data');
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
  svg.innerHTML = ''; // Clear previous content

  if (transactions.length === 0) return;

  // Calculate cumulative XP
  let cumulativeXP = 0;
  const data = transactions.map(t => {
    cumulativeXP += t.amount;
    return { date: new Date(t.createdAt), xp: cumulativeXP };
  });

  // SVG dimensions
  const width = 500;
  const height = 300;
  const padding = 40;

  // Scales
  const minDate = new Date(Math.min(...data.map(d => d.date)));
  const maxDate = new Date(Math.max(...data.map(d => d.date)));
  const maxXP = Math.max(...data.map(d => d.xp));

  const xScale = (date) => ((date - minDate) / (maxDate - minDate)) * (width - 2 * padding) + padding;
  const yScale = (xp) => height - padding - (xp / maxXP) * (height - 2 * padding);

  // Line path
  const path = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xScale(d.date)},${yScale(d.xp)}`).join(' ');

  // Draw line
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  line.setAttribute('d', path);
  line.setAttribute('stroke', 'blue');
  line.setAttribute('fill', 'none');
  svg.appendChild(line);

  // Draw axes
  const xAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  xAxis.setAttribute('x1', padding);
  xAxis.setAttribute('y1', height - padding);
  xAxis.setAttribute('x2', width - padding);
  xAxis.setAttribute('y2', height - padding);
  xAxis.setAttribute('stroke', 'black');
  svg.appendChild(xAxis);

  const yAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  yAxis.setAttribute('x1', padding);
  yAxis.setAttribute('y1', padding);
  yAxis.setAttribute('x2', padding);
  yAxis.setAttribute('y2', height - padding);
  yAxis.setAttribute('stroke', 'black');
  svg.appendChild(yAxis);
}

// Render XP per project graph (bar chart)
function renderXpPerProject(transactions) {
  const svg = document.getElementById('xp-per-project');
  svg.innerHTML = ''; // Clear previous content

  if (transactions.length === 0) return;

  // Group by project name and sum XP
  const projectXP = {};
  transactions.forEach(t => {
    const project = t.object.name;
    projectXP[project] = (projectXP[project] || 0) + t.amount;
  });

  const projects = Object.entries(projectXP);
  const maxXP = Math.max(...projects.map(p => p[1]));

  // SVG dimensions
  const width = 500;
  const height = 300;
  const padding = 40;
  const barWidth = (width - 2 * padding) / projects.length;

  // Scales
  const yScale = (xp) => height - padding - (xp / maxXP) * (height - 2 * padding);

  // Draw bars
  projects.forEach((p, i) => {
    const bar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bar.setAttribute('x', padding + i * barWidth);
    bar.setAttribute('y', yScale(p[1]));
    bar.setAttribute('width', barWidth - 10);
    bar.setAttribute('height', height - padding - yScale(p[1]));
    bar.setAttribute('fill', 'green');
    svg.appendChild(bar);

    // Label
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', padding + i * barWidth + (barWidth - 10) / 2);
    text.setAttribute('y', height - padding + 20);
    text.setAttribute('text-anchor', 'middle');
    text.textContent = p[0];
    svg.appendChild(text);
  });

  // Draw y-axis
  const yAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  yAxis.setAttribute('x1', padding);
  yAxis.setAttribute('y1', padding);
  yAxis.setAttribute('x2', padding);
  yAxis.setAttribute('y2', height - padding);
  yAxis.setAttribute('stroke', 'black');
  svg.appendChild(yAxis);
}