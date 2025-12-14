
import { Router, Request, Response } from 'express';
import { registerUser, loginUser, verifyToken } from '../services/authService.js';
import { query } from '../db/pool.js';

const router: Router = Router();

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, fullName } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }
    const result = await registerUser(email, password, fullName);
    
    // Set cookie
    res.cookie('auth_token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }
    const result = await loginUser(email, password);

    // Set cookie
    res.cookie('auth_token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    res.json(result);
  } catch (error: any) {
    res.status(401).json({ error: error.message });
  }
});

router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('auth_token');
  res.json({ success: true });
});

router.get('/me', async (req: Request, res: Response) => {
  const token = req.cookies?.auth_token || req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const decoded = await verifyToken(token);
  if (!decoded) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  // Fetch full user details (excluding password)
  const user = await query('SELECT id, email, full_name, created_at FROM users WHERE id = $1', [decoded.userId]);
  
  if (user.rows.length === 0) {
     res.status(404).json({ error: 'User not found' });
     return;
  }

  res.json({ user: user.rows[0] });
});

export default router;
