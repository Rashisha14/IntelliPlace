const jwt = require('jsonwebtoken');

const token = jwt.sign({ id: 2, userType: 'company', email: 'test@company.com' }, process.env.JWT_SECRET || 'your_jwt_secret', { expiresIn: '1d' });

const q = {
  sections: [{ name: "General", questions: 1 }],
  cutoff: 50,
  totalQuestions: 1,
  questions: [{
    questionText: "What is 2+2?",
    options: ["3","4","5","6"],
    correctIndex: 1,
    marks: 1,
    section: "General"
  }]
};

fetch('http://localhost:5000/api/jobs/1/aptitude-test', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify(q)
}).then(r => r.json()).then(console.log).catch(console.error);
