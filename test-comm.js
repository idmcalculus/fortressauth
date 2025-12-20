async function testCommunication() {
  const serverUrl = 'http://localhost:3005';
  console.log(`Testing communication with server at ${serverUrl}...`);

  try {
    const response = await fetch(`${serverUrl}/health`);
    const health = await response.json();
    console.log('Server health:', JSON.stringify(health, null, 2));

    if (health.status !== 'ok') {
      console.error('Server is not healthy');
      process.exit(1);
    }

    // Test registration (inter-package: server -> core -> adapter-sql)
    console.log('Testing user registration...');
    const signupResponse = await fetch(`${serverUrl}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `test-${Date.now()}@example.com`,
        password: 'SecurePassword123!',
      }),
    });

    const signupData = await signupResponse.json();
    console.log('Signup result:', JSON.stringify(signupData, null, 2));

    if (signupData.success) {
      console.log('✅ Inter-package communication verified!');
    } else {
      console.error('❌ Signup failed:', signupData.error);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Communication test failed:', error);
    process.exit(1);
  }
}

testCommunication();
