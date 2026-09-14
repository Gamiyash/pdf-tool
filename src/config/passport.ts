import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { env } from './env.config';
import { authService } from '../services/auth.service';
import { UserRepository } from '../repositories/user.repository';
import dns from 'dns';

// Fix for Node >= 17 IPv6 socket/TLS resolution issues terminating internal Google API handshakes
try {
    dns.setDefaultResultOrder('ipv4first');
} catch (e) { }

const userRepository = new UserRepository();

passport.serializeUser((user: any, done) => {
    done(null, user._id || user.id);
});

passport.deserializeUser(async (id: string, done) => {
    try {
        const user = await userRepository.findById(id);
        done(null, user || false);
    } catch (err) {
        done(err, null);
    }
});

passport.use(new LocalStrategy(
    { usernameField: 'email', passwordField: 'password' },
    async (email, password, done) => {
        try {
            const user = await authService.authenticateLocalUser(email, password);
            return done(null, user || false);
        } catch (err: any) {
            return done(null, false, { message: err.message });
        }
    }
));

passport.use(new GoogleStrategy({
    clientID: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    callbackURL: `http://localhost:${env.PORT}/api/auth/google/callback`
},
    async (accessToken, refreshToken, profile, done) => {
        try {
            const email = profile.emails?.[0].value;
            if (!email) {
                return done(new Error("No email found in Google profile"), false);
            }

            let user = await userRepository.findByGoogleId(profile.id);
            if (user) {
                return done(null, user || false); // Found existing google user
            }

            // Check if user exists by email, if so link them
            user = await userRepository.findByEmail(email);
            if (user) {
                user = await userRepository.linkGoogle((user as any)._id || (user as any).id, profile.id);
                return done(null, user || false);
            }

            // Completely new Google-only user
            user = await userRepository.create({
                name: profile.displayName || 'Google User',
                email,
                googleId: profile.id
            });

            return done(null, user || false);
        } catch (err) {
            return done(err, false);
        }
    }
));

export default passport;
