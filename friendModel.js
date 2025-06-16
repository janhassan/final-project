const db = require('../db');

class FriendModel {
    // إرسال طلب صداقة
    static async sendFriendRequest(from, to) {
        const [result] = await db.query(
            'INSERT INTO friend_requests (from_user, to_user, status) VALUES (?, ?, "pending")',
            [from, to]
        );
        return result;
    }

    // الرد على طلب الصداقة
    static async respondToFriendRequest(from, to, accepted) {
        if (accepted) {
            // إضافة الصداقة إلى الجدول
            await db.query(
                'INSERT INTO friends (user1, user2) VALUES (?, ?)',
                [from, to]
            );
        }

        // تحديث حالة الطلب
        const [result] = await db.query(
            'UPDATE friend_requests SET status = ? WHERE from_user = ? AND to_user = ?',
            [accepted ? 'accepted' : 'rejected', from, to]
        );

        return result;
    }

    // إزالة صديق
    static async removeFriend(username1, username2) {
        const [result] = await db.query(
            'DELETE FROM friends WHERE (user1 = ? AND user2 = ?) OR (user1 = ? AND user2 = ?)',
            [username1, username2, username2, username1]
        );
        return result;
    }

    // الحصول على قائمة الأصدقاء
    static async getFriendsList(username) {
        const [friends] = await db.query(`
            SELECT 
                CASE 
                    WHEN user1 = ? THEN user2 
                    ELSE user1 
                END as friend_username,
                u.online_status as online,
                u.status as status
            FROM friends f
            JOIN users u ON 
                (f.user1 = u.username AND f.user1 != ?) OR 
                (f.user2 = u.username AND f.user2 != ?)
            WHERE user1 = ? OR user2 = ?
        `, [username, username, username, username, username]);

        return friends;
    }

    // الحصول على طلبات الصداقة الواردة
    static async getFriendRequests(username) {
        const [requests] = await db.query(
            'SELECT from_user as from FROM friend_requests WHERE to_user = ? AND status = "pending"',
            [username]
        );
        return requests;
    }

    // الحصول على طلبات الصداقة الصادرة
    static async getPendingRequests(username) {
        const [requests] = await db.query(
            'SELECT to_user as to FROM friend_requests WHERE from_user = ? AND status = "pending"',
            [username]
        );
        return requests;
    }

    // البحث عن مستخدمين
    static async searchUsers(query) {
        const [users] = await db.query(
            'SELECT username, online_status as online FROM users WHERE username LIKE ? LIMIT 10',
            [`%${query}%`]
        );
        return users;
    }
}

module.exports = FriendModel;
