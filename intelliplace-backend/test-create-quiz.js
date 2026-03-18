import axios from 'axios';
import fs from 'fs';

async function testCreateQuiz() {
  try {
    console.log("Starting test script...");
    // 1. Login as company
    const loginRes = await axios.post('http://localhost:5000/api/auth/login/company', {
      email: 'wipro@mail.com',
      password: 'wiproteam'
    });
    const token = loginRes.data.token;
    console.log("Logged in successfully. Token length:", token.length);

    // 2. Create a dummy job
    const jobRes = await axios.post('http://localhost:5000/api/jobs', {
      title: "Test Job",
      description: "Test",
      type: "FULL_TIME"
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const job = jobRes.data.data;
    console.log('Using job:', job.id, job.title, job.status);

    // 3. Make sure job is CLOSED
    if (job.status !== 'CLOSED') {
      console.log('Closing job...');
      await axios.post(`http://localhost:5000/api/jobs/${job.id}/close`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('Job closed.');
    }

    // 4. Create Quiz
    console.log('Attempting to create quiz...');
    const createRes = await axios.post(`http://localhost:5000/api/jobs/${job.id}/aptitude-test`, {
      sections: [{ name: "Test Section", questions: 1 }],
      cutoff: 50,
      totalQuestions: 1,
      questions: [{
        section: "Test Section",
        questionText: "What is 2+2?",
        options: ["1", "2", "3", "4"],
        correctIndex: 3,
        marks: 1
      }]
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log('Quiz creation response:', createRes.data);

  } catch (error) {
    if (error.response) {
      console.error('API Error:', error.response.status, error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  }
}

testCreateQuiz();
