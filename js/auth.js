// Authentication module for the MCQ Exam Platform

const AUTH_SESSION_KEY = 'mcq_admin_session';
const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'admin123';

class MCQAuth {
    constructor() {
        this.ensureDefaultAdmin();
    }

    // SHA-256 hash using SubtleCrypto API
    async hashPassword(password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // Ensure default admin exists
    async ensureDefaultAdmin() {
        const admins = storage.getAllAdmins();
        if (admins.length === 0) {
            const passwordHash = await this.hashPassword(DEFAULT_ADMIN_PASSWORD);
            storage.createAdmin({
                username: DEFAULT_ADMIN_USERNAME,
                password_hash: passwordHash
            });
            console.log('Default admin created (admin/admin123)');
        }
    }

    // Login with username and password
    async login(username, password) {
        const admin = storage.getAdminByUsername(username);
        if (!admin) {
            return { success: false, message: 'Invalid username or password' };
        }

        const passwordHash = await this.hashPassword(password);
        if (admin.password_hash !== passwordHash) {
            return { success: false, message: 'Invalid username or password' };
        }

        // Create session
        const session = {
            adminId: admin.id,
            username: admin.username,
            loginTime: MCQUtils.getCurrentTimestamp()
        };

        sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));

        return { success: true, redirect: 'dashboard.html' };
    }

    // Logout
    logout() {
        sessionStorage.removeItem(AUTH_SESSION_KEY);
    }

    // Check if user is authenticated
    isAuthenticated() {
        const session = sessionStorage.getItem(AUTH_SESSION_KEY);
        return session !== null;
    }

    // Get current session
    getSession() {
        const session = sessionStorage.getItem(AUTH_SESSION_KEY);
        return session ? JSON.parse(session) : null;
    }

    // Require authentication - redirect to login if not authenticated
    requireAuth() {
        if (!this.isAuthenticated()) {
            window.location.href = 'index.html';
            return false;
        }
        return true;
    }

    // Change password
    async changePassword(currentPassword, newPassword) {
        const session = this.getSession();
        if (!session) {
            return { success: false, message: 'Not authenticated' };
        }

        const admin = storage.getAdminByUsername(session.username);
        if (!admin) {
            return { success: false, message: 'Admin not found' };
        }

        // Verify current password
        const currentHash = await this.hashPassword(currentPassword);
        if (admin.password_hash !== currentHash) {
            return { success: false, message: 'Current password is incorrect' };
        }

        // Validate new password
        if (newPassword.length < 6) {
            return { success: false, message: 'Password must be at least 6 characters' };
        }

        // Update password
        const newHash = await this.hashPassword(newPassword);
        storage.updateAdmin(admin.id, { password_hash: newHash });

        return { success: true, message: 'Password updated successfully' };
    }
}

// Export singleton instance
window.auth = new MCQAuth();
