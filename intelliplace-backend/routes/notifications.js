import express from 'express';
import prisma from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Middleware: only students can access notifications
const authorizeStudent = (req, res, next) => {
  if (!req.user || req.user.userType !== 'student') return res.status(403).json({ success: false, message: 'Student access required' });
  next();
};

// Get notifications for current student
router.get('/', authenticateToken, authorizeStudent, async (req, res) => {
  try {
    const studentId = req.user.id;
    const notifications = await prisma.notification.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      include: { job: true, application: true }
    });
    res.json({ success: true, data: { notifications } });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ success: false, message: 'Server error fetching notifications' });
  }
});

// Mark a single notification as read
router.patch('/:id/read', authenticateToken, authorizeStudent, async (req, res) => {
  try {
    const studentId = req.user.id;
    const id = parseInt(req.params.id);
    const notif = await prisma.notification.findUnique({ where: { id } });
    if (!notif || notif.studentId !== studentId) return res.status(404).json({ success: false, message: 'Notification not found or access denied' });

    await prisma.notification.update({ where: { id }, data: { read: true } });
    res.json({ success: true, message: 'Marked as read' });
  } catch (error) {
    console.error('Error marking notification read:', error);
    res.status(500).json({ success: false, message: 'Server error marking notification' });
  }
});

// Mark all notifications as read
router.post('/mark-all-read', authenticateToken, authorizeStudent, async (req, res) => {
  try {
    const studentId = req.user.id;
    await prisma.notification.updateMany({ where: { studentId, read: false }, data: { read: true } });
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Error marking all notifications read:', error);
    res.status(500).json({ success: false, message: 'Server error marking notifications' });
  }
});

export default router;
