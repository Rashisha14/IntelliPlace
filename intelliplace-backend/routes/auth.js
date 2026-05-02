import express from 'express';
import prisma from '../lib/prisma.js';
import jwt from 'jsonwebtoken';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Register Student
router.post('/register/student', async (req, res) => {
  try {
  const { name, email, password, rollNumber, phone, cgpa, backlog } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
    }

    const existingStudent = await prisma.student.findUnique({
      where: { email },
    });

    if (existingStudent) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    const student = await prisma.student.create({
      data: {
        name,
        email,
        password, // saved directly (not hashed) - note: plain-text storage
        rollNumber: rollNumber || null,
        phone: phone || null,
        cgpa: cgpa ? parseFloat(cgpa) : null,
        backlog: backlog ? parseInt(backlog) : null,
      },
    });

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

    const existingCompany = await prisma.company.findUnique({
      where: { email },
    });

    if (existingCompany) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    const company = await prisma.company.create({
      data: {
        companyName,
        email,
        password, // plain text
        industry: industry || null,
        website: website || null,
        phone: phone || null,
      },
    });

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

    const student = await prisma.student.findUnique({
      where: { email },
    });

    if (!student || student.password !== password) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

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

    const company = await prisma.company.findUnique({
      where: { email },
    });

    if (!company || company.password !== password) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

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

    const admin = await prisma.admin.findFirst({
      where: { username },
    });

    if (!admin || admin.password !== password) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: admin.id, username: admin.username, userType: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: admin.id,
        username: admin.username,
        name: 'Admin',
        userType: 'admin',
      },
      token,
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
});

// Get Profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const { id, userType } = req.user;

    if (userType === 'student') {
      const student = await prisma.student.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          email: true,
          rollNumber: true,
          phone: true,
          cgpa: true,
          backlog: true,
        }
      });
      if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
      return res.json({ success: true, user: { ...student, userType } });
    } else if (userType === 'company') {
      const company = await prisma.company.findUnique({
        where: { id },
        select: {
          id: true,
          companyName: true,
          email: true,
          industry: true,
          website: true,
          phone: true,
        }
      });
      if (!company) return res.status(404).json({ success: false, message: 'Company not found' });
      return res.json({ success: true, user: { ...company, name: company.companyName, userType } });
    }

    return res.status(400).json({ success: false, message: 'Invalid user type' });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update Profile
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { id, userType } = req.user;
    
    if (userType === 'student') {
      const { name, phone, rollNumber } = req.body;
      const updated = await prisma.student.update({
        where: { id },
        data: {
          name: name || undefined,
          phone: phone !== undefined ? phone : undefined,
          rollNumber: rollNumber !== undefined ? rollNumber : undefined,
        }
      });
      return res.json({ success: true, message: 'Profile updated successfully', user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        rollNumber: updated.rollNumber,
        phone: updated.phone,
        userType: 'student'
      }});
    } else if (userType === 'company') {
      const { companyName, phone, industry, website } = req.body;
      const updated = await prisma.company.update({
        where: { id },
        data: {
          companyName: companyName || undefined,
          phone: phone !== undefined ? phone : undefined,
          industry: industry !== undefined ? industry : undefined,
          website: website !== undefined ? website : undefined,
        }
      });
      return res.json({ success: true, message: 'Profile updated successfully', user: {
        id: updated.id,
        companyName: updated.companyName,
        name: updated.companyName,
        email: updated.email,
        industry: updated.industry,
        website: updated.website,
        phone: updated.phone,
        userType: 'company'
      }});
    }

    return res.status(400).json({ success: false, message: 'Invalid user type' });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, message: 'Server error updating profile' });
  }
});

// Update Password
router.put('/password', authenticateToken, async (req, res) => {
  try {
    const { id, userType } = req.user;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current and new password are required' });
    }

    if (userType === 'student') {
      const student = await prisma.student.findUnique({ where: { id } });
      if (!student || student.password !== currentPassword) {
        return res.status(401).json({ success: false, message: 'Incorrect current password' });
      }
      await prisma.student.update({
        where: { id },
        data: { password: newPassword }
      });
      return res.json({ success: true, message: 'Password updated successfully' });
    } else if (userType === 'company') {
      const company = await prisma.company.findUnique({ where: { id } });
      if (!company || company.password !== currentPassword) {
        return res.status(401).json({ success: false, message: 'Incorrect current password' });
      }
      await prisma.company.update({
        where: { id },
        data: { password: newPassword }
      });
      return res.json({ success: true, message: 'Password updated successfully' });
    }

    return res.status(400).json({ success: false, message: 'Invalid user type' });
  } catch (error) {
    console.error('Update password error:', error);
    res.status(500).json({ success: false, message: 'Server error updating password' });
  }
});

export default router;
