import jwt from 'jsonwebtoken';

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

export const authorizeCompany = (req, res, next) => {
  if (!req.user || req.user.userType !== 'company') {
    return res.status(403).json({ success: false, message: 'Company access required' });
  }
  next();
};

export const authorizeStudent = (req, res, next) => {
  if (!req.user || req.user.userType !== 'student') {
    return res.status(403).json({ success: false, message: 'Student access required' });
  }
  next();
};
