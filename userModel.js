const db = require('../config/db');


// إنشاء مستخدم جديد
async function createUser(name, email, password) {
    const [result] = await db.query(
        "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
        [name, email, password]
    );
    return result.insertId;
}

// البحث عن مستخدم بالإيميل
async function findUserByEmail(email) {
    const [rows] = await db.query(
        "SELECT * FROM users WHERE email = ?",
        [email]
    );
    return rows[0];
}

// (اختياري) البحث عن مستخدم بالـ ID
async function findUserById(id) {
    const [rows] = await db.query(
        "SELECT * FROM users WHERE id = ?",
        [id]
    );
    return rows[0];
}


// دالة للتحقق من وجود مستخدم
async function getUserByUsername(username) {
    const sql = 'SELECT * FROM users WHERE username = ?';
    const [user] = await db.query(sql, [username]);
    return user;
}

// دالة للتحقق من وجود صداقة بين مستخدمين
async function areFriends(user1Id, user2Id) {
    const sql = `
        SELECT * FROM friends 
        WHERE (user1_id = ? AND user2_id = ?) 
        OR (user1_id = ? AND user2_id = ?)
    `;
    const [friends] = await db.query(sql, [user1Id, user2Id, user2Id, user1Id]);
    return friends.length > 0;
}

// دالة للتحقق من وجود طلب صداقة معلق
async function hasPendingRequest(senderId, receiverId) {
    const sql = `
        SELECT * FROM friend_requests 
        WHERE sender_id = ? AND receiver_id = ? AND status = 'pending'
    `;
    const [requests] = await db.query(sql, [senderId, receiverId]);
    return requests.length > 0;
}

// دالة لحفظ طلب صداقة
async function saveFriendRequest(senderId, receiverId) {
    const sql = `
        INSERT INTO friend_requests (sender_id, receiver_id, status)
        VALUES (?, ?, 'pending')
    `;
    const result = await db.query(sql, [senderId, receiverId]);
    
    // إنشاء إشعار للمستقبل
    await createNotification(
        receiverId,
        'friend_request',
        `لديك طلب صداقة جديد من ${senderId}`,
        senderId
    );
    
    return result;
}

// دالة للرد على طلب صداقة
async function updateFriendRequest(senderId, receiverId, accepted) {
    const status = accepted ? 'accepted' : 'rejected';
    const sql = `
        UPDATE friend_requests 
        SET status = ?, updated_at = NOW()
        WHERE sender_id = ? AND receiver_id = ?
    `;
    const result = await db.query(sql, [status, senderId, receiverId]);
    
    if (accepted) {
        // إضافة الصداقة إلى جدول الأصدقاء
        await addFriendship(senderId, receiverId);
        
        // إنشاء إشعار للمرسل بقبول الطلب
        await createNotification(
            senderId,
            'friend_accept',
            `قام ${receiverId} بقبول طلب الصداقة الخاص بك`,
            receiverId
        );
    }
    
    return result;
}

// دالة لإضافة صداقة
async function addFriendship(user1Id, user2Id) {
    // التأكد من أن المعرف الأصغر يأتي أولاً لتجنب تكرار السجلات
    const [id1, id2] = [user1Id, user2Id].sort((a, b) => a - b);
    
    const sql = `
        INSERT INTO friends (user1_id, user2_id)
        VALUES (?, ?)
    `;
    return await db.query(sql, [id1, id2]);
}

// دالة لإزالة صداقة
async function removeFriendship(user1Id, user2Id) {
    const sql = `
        DELETE FROM friends 
        WHERE (user1_id = ? AND user2_id = ?)
        OR (user1_id = ? AND user2_id = ?)
    `;
    return await db.query(sql, [user1Id, user2Id, user2Id, user1Id]);
}

// دالة للحصول على قائمة الأصدقاء
async function getFriendsList(userId) {
    const sql = `
        SELECT u.id, u.username, u.avatar, u.status 
        FROM friends f
        JOIN users u ON (f.user1_id = u.id OR f.user2_id = u.id) AND u.id != ?
        WHERE f.user1_id = ? OR f.user2_id = ?
    `;
    return await db.query(sql, [userId, userId, userId]);
}

// دالة للحصول على طلبات الصداقة الواردة
async function getFriendRequests(userId) {
    const sql = `
        SELECT fr.id, u.id as sender_id, u.username, u.avatar, fr.created_at 
        FROM friend_requests fr
        JOIN users u ON fr.sender_id = u.id
        WHERE fr.receiver_id = ? AND fr.status = 'pending'
    `;
    return await db.query(sql, [userId]);
}

// دالة للحصول على طلبات الصداقة الصادرة
async function getPendingRequests(userId) {
    const sql = `
        SELECT fr.id, u.id as receiver_id, u.username, u.avatar, fr.created_at 
        FROM friend_requests fr
        JOIN users u ON fr.receiver_id = u.id
        WHERE fr.sender_id = ? AND fr.status = 'pending'
    `;
    return await db.query(sql, [userId]);
}

// دالة لإنشاء إشعار
async function createNotification(userId, type, content, relatedId) {
    const sql = `
        INSERT INTO notifications (user_id, type, content, related_id)
        VALUES (?, ?, ?, ?)
    `;
    return await db.query(sql, [userId, type, content, relatedId]);
}

module.exports = {
    createUser,
    findUserByEmail,
    findUserById,
    getUserByUsername,
    areFriends,
    hasPendingRequest,
    saveFriendRequest,
    updateFriendRequest,
    addFriendship,
    removeFriendship,
    getFriendsList,
    getFriendRequests,
    getPendingRequests,
    createNotification
};
