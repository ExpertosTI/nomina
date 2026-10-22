import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export type AuthUser = {
  id: string;
  email: string;
  role: string;
  companyId: string;
  name: string;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const secret = () => process.env.JWT_SECRET || 'dev_secret_change_me';

export function signToken(user: AuthUser) {
  return jwt.sign(user, secret(), { expiresIn: '7d' });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    req.user = jwt.verify(token, secret()) as AuthUser;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

export function requireListenerSecret(req: Request, res: Response, next: NextFunction) {
  const secretHdr = req.headers['x-listener-secret'];
  if (!process.env.LISTENER_FORWARD_SECRET) return next();
  if (secretHdr !== process.env.LISTENER_FORWARD_SECRET) {
    return res.status(403).json({ error: 'Listener no autorizado' });
  }
  next();
}
