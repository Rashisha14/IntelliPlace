import express from 'express';
import prisma from '../lib/prisma.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const router = express.Router();

// Register Student
router.post('/register/student', async (req, res) => {
  try {
    const { name, email, password, rollNumber, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
    }

    // Check if email already exists
    const existingStudent = await prisma.student.findUnique({
      where: { email },
    });

    if (existingStudent) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create student
    const student = await prisma.student.create({
      data: {
        name,
        email,
        password: hashedPassword,
        rollNumber: rollNumber || null,
        phone: phone || null,
      },
    });

    // Generate JWT token
    const token = jwt.sign(
      { id: student.id, email: student.email, userType: 'student' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'Student registered successfully',
      user: {
        id: student.id,
        name: student.name,
        email: student.email,
        rollNumber: student.rollNumber,
        phone: student.phone,
        userType: 'student',
      },
      token,
    });
  } catch (error) {
    console.error('Student registration error:', error);
    res.status(500).json({ success: false, message: 'Server error during registration' });
  }
});

// Register Company
router.post('/register/company', async (req, res) => {
  try {
    const { companyName, email, password, industry, website, phone } = req.body;

    if (!companyName || !email || !password) {
      return res.status(400).json({ success: false, message: 'Company name, email, and password are required' });
    }

    // Check if email already exists
    const existingCompany = await prisma.company.findUnique({
      where: { email },
    });

    if (existingCompany) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create company
    const company = await prisma.company.create({
      data: {
        companyName,
        email,
        password: hashedPassword,
        industry: industry || null,
        website: website || null,
        phone: phone || null,
      },
    });

    // Generate JWT token
    const token = jwt.sign(
      { id: company.id, email: company.email, userType: 'company' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'Company registered successfully',
      user: {
        id: company.id,
        companyName: company.companyName,
        name: company.companyName,
        email: company.email,
        industry: company.industry,
        website: company.website,
        phone: company.phone,
        userType: 'company',
      },
      token,
    });
  } catch (error) {
    console.error('Company registration error:', error);
    res.status(500).json({ success: false, message: 'Server error during registration' });
  }
});

// Login Student
router.post('/login/student', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    // Find student
    const student = await prisma.student.findUnique({
      where: { email },
    });

    if (!student) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, student.password);

    if (!isValidPassword) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: student.id, email: student.email, userType: 'student' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: student.id,
        name: student.name,
        email: student.email,
        rollNumber: student.rollNumber,
        phone: student.phone,
        userType: 'student',
      },
      token,
    });
  } catch (error) {
    console.error('Student login error:', error);
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
});

// Login Company
router.post('/login/company', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    // Find company
    const company = await prisma.company.findUnique({
      where: { email },
    });

    if (!company) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, company.password);

    if (!isValidPassword) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: company.id, email: company.email, userType: 'company' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: company.id,
        companyName: company.companyName,
        name: company.companyName,
        email: company.email,
        industry: company.industry,
        website: company.website,
        phone: company.phone,
        userType: 'company',
      },
      token,
    });
  } catch (error) {
    console.error('Company login error:', error);
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
});

// Login Admin
router.post('/login/admin', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }

    // Find admin
    const admin = await prisma.admin.findFirst({
      where: { username },
    });

    if (!admin) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Direct password comparison for existing admin
    if (password === admin.password) {
      const token = jwt.sign(
        { id: admin.id, username: admin.username, userType: 'admin' },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.json({
        success: true,
        message: 'Login successful',
        user: {
          id: admin.id,
          username: admin.username,
      });
    }

    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
});

export default router;
