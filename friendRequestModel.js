const db = require('../db');

class FriendRequestModel {
    
    // إرسال طلب صداقة
    static async sendFriendRequest(fromUser, toUser) {
        try {
            // التحقق من وجود طلب سابق
            const existingRequest = await this.getExistingRequest(fromUser, toUser);
            if (existingRequest) {
                throw new Error('Friend request already exists');
            }

            // التحقق من كونهما أصدقاء بالفعل
            const alreadyFriends = await this.areFriends(fromUser, toUser);
            if (alreadyFriends) {
                throw new Error('Users are already friends');
            }

            // استخدام أسماء الأعمدة الصحيحة من قاعدة البيانات
            const sql = `
                INSERT INTO friend_requests 
                (from_user, to_user, status, created_at)
                VALUES (?, ?, 'pending', NOW())
            `;
            
            const result = await db.query(sql, [fromUser, toUser]);
            
            return {
                id: result.insertId || result[0]?.insertId,
                from_user: fromUser,
                to_user: toUser,
                status: 'pending',
                created_at: new Date()
            };
        } catch (error) {
            console.error('Error in FriendRequestModel.sendFriendRequest:', error);
            throw error;
        }
    }

    // الحصول على طلبات الصداقة الواردة
    static async getIncomingRequests(username) {
        try {
            const sql = `
                SELECT 
                    id,
                    from_user,
                    to_user,
                    status,
                    created_at,
                    updated_at
                FROM friend_requests 
                WHERE to_user = ? AND status = 'pending'
                ORDER BY created_at DESC
            `;
            const [rows] = await db.query(sql, params);
            return rows;
        } catch (error) {
            console.error('Error in FriendRequestModel.getIncomingRequests:', error);
            throw error;
        }
    }

    // إضافة هذه الدالة المفقودة التي يبحث عنها السيرفر
    static async getPendingRequests(username) {
        return await this.getIncomingRequests(username);
    }

    // الحصول على طلبات الصداقة الصادرة
    static async getOutgoingRequests(username) {
        try {
            const sql = `
                SELECT 
                    id,
                    from_user,
                    to_user,
                    status,
                    created_at,
                    updated_at
                FROM friend_requests 
                WHERE from_user = ? AND status = 'pending'
                ORDER BY created_at DESC
            `;
            
            return await db.query(sql, [username]);
        } catch (error) {
            console.error('Error in FriendRequestModel.getOutgoingRequests:', error);
            throw error;
        }
    }

    // قبول أو رفض طلب الصداقة
    static async respondToRequest(requestId, response) {
        try {
            // التحقق من صحة الاستجابة
            if (!['accepted', 'declined'].includes(response)) {
                throw new Error('Invalid response. Must be "accepted" or "declined"');
            }

            // الحصول على تفاصيل الطلب
            const request = await this.getRequestById(requestId);
            if (!request) {
                throw new Error('Friend request not found');
            }

            if (request.status !== 'pending') {
                throw new Error('Friend request already processed');
            }

            // تحديث حالة الطلب
            const updateSql = `
                UPDATE friend_requests 
                SET status = ?, updated_at = NOW()
                WHERE id = ?
            `;
            
            await db.query(updateSql, [response, requestId]);

            // إذا تم قبول الطلب، إضافة الصداقة
            if (response === 'accepted') {
                await this.addFriendship(request.from_user, request.to_user);
            }

            return {
                requestId: requestId,
                status: response,
                fromUser: request.from_user,
                toUser: request.to_user
            };
        } catch (error) {
            console.error('Error in FriendRequestModel.respondToRequest:', error);
            throw error;
        }
    }

    // الحصول على طلب الصداقة بالمعرف
    static async getRequestById(requestId) {
        try {
            const sql = 'SELECT * FROM friend_requests WHERE id = ?';
            const requests = await db.query(sql, [requestId]);
            return requests[0] || null;
        } catch (error) {
            console.error('Error in FriendRequestModel.getRequestById:', error);
            throw error;
        }
    }

    // التحقق من وجود طلب سابق
    static async getExistingRequest(fromUser, toUser) {
        try {
            const sql = `
                SELECT * FROM friend_requests 
                WHERE ((from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?))
                AND status = 'pending'
            `;
            
            const requests = await db.query(sql, [fromUser, toUser, toUser, fromUser]);
            return requests[0] || null;
        } catch (error) {
            console.error('Error in FriendRequestModel.getExistingRequest:', error);
            throw error;
        }
    }

    // التحقق من كون المستخدمين أصدقاء
    static async areFriends(user1, user2) {
        try {
            const sql = `
                SELECT * FROM friends 
                WHERE (user1 = ? AND user2 = ?) OR (user1 = ? AND user2 = ?)
            `;
            
            const friends = await db.query(sql, [user1, user2, user2, user1]);
            return friends.length > 0;
        } catch (error) {
            console.error('Error in FriendRequestModel.areFriends:', error);
            throw error;
        }
    }

    // إضافة صداقة جديدة
    static async addFriendship(user1, user2) {
        try {
            const sql = `
                INSERT INTO friends 
                (user1, user2, created_at)
                VALUES (?, ?, NOW())
            `;
            
            // إضافة الصداقة من الاتجاهين
            await db.query(sql, [user1, user2]);
            
            return true;
        } catch (error) {
            console.error('Error in FriendRequestModel.addFriendship:', error);
            throw error;
        }
    }

    // الحصول على قائمة الأصدقاء
    static async getFriendsList(username) {
        try {
            const sql = `
                SELECT 
                    CASE 
                        WHEN user1 = ? THEN user2
                        ELSE user1
                    END as friend_username,
                    created_at
                FROM friends 
                WHERE user1 = ? OR user2 = ?
                ORDER BY created_at DESC
            `;
            
            return await db.query(sql, [username, username, username]);
        } catch (error) {
            console.error('Error in FriendRequestModel.getFriendsList:', error);
            throw error;
        }
    }

    // حذف صداقة
    static async removeFriend(user1, user2) {
        try {
            const sql = `
                DELETE FROM friends 
                WHERE (user1 = ? AND user2 = ?) OR (user1 = ? AND user2 = ?)
            `;
            
            const result = await db.query(sql, [user1, user2, user2, user1]);
            return result.affectedRows > 0;
        } catch (error) {
            console.error('Error in FriendRequestModel.removeFriend:', error);
            throw error;
        }
    }

    // حذف طلب الصداقة
    static async deleteFriendRequest(requestId) {
        try {
            const sql = 'DELETE FROM friend_requests WHERE id = ?';
            const result = await db.query(sql, [requestId]);
            return result.affectedRows > 0;
        } catch (error) {
            console.error('Error in FriendRequestModel.deleteFriendRequest:', error);
            throw error;
        }
    }

    // الحصول على جميع طلبات الصداقة (واردة وصادرة)
    static async getAllRequests(username) {
        try {
            const incoming = await this.getIncomingRequests(username);
            const outgoing = await this.getOutgoingRequests(username);
            
            return {
                incoming: incoming,
                outgoing: outgoing,
                total: incoming.length + outgoing.length
            };
        } catch (error) {
            console.error('Error in FriendRequestModel.getAllRequests:', error);
            throw error;
        }
    }

    // البحث عن المستخدمين للإضافة كأصدقاء
    static async searchUsers(searchTerm, currentUser, limit = 10) {
        try {
            const sql = `
                SELECT 
                    username,
                    email,
                    created_at
                FROM users 
                WHERE username LIKE ? 
                AND username != ?
                AND username NOT IN (
                    SELECT CASE 
                        WHEN user1 = ? THEN user2
                        ELSE user1
                    END 
                    FROM friends 
                    WHERE user1 = ? OR user2 = ?
                )
                AND username NOT IN (
                    SELECT to_user FROM friend_requests 
                    WHERE from_user = ? AND status = 'pending'
                )
                LIMIT ?
            `;
            
            return await db.query(sql, [
                `%${searchTerm}%`, 
                currentUser, 
                currentUser, 
                currentUser, 
                currentUser, 
                currentUser, 
                limit
            ]);
        } catch (error) {
            console.error('Error in FriendRequestModel.searchUsers:', error);
            throw error;
        }
    }

    // إحصائيات الأصدقاء
    static async getFriendsStats(username) {
        try {
            const friendsCount = await this.getFriendsCount(username);
            const pendingRequestsCount = await this.getPendingRequestsCount(username);
            const sentRequestsCount = await this.getSentRequestsCount(username);
            
            return {
                friendsCount: friendsCount,
                pendingRequests: pendingRequestsCount,
                sentRequests: sentRequestsCount
            };
        } catch (error) {
            console.error('Error in FriendRequestModel.getFriendsStats:', error);
            throw error;
        }
    }

    // عدد الأصدقاء
    static async getFriendsCount(username) {
        try {
            const sql = `
                SELECT COUNT(*) as count 
                FROM friends 
                WHERE user1 = ? OR user2 = ?
            `;
            
            const result = await db.query(sql, [username, username]);
            return result[0].count;
        } catch (error) {
            console.error('Error in FriendRequestModel.getFriendsCount:', error);
            throw error;
        }
    }

    // عدد طلبات الصداقة المعلقة
    static async getPendingRequestsCount(username) {
        try {
            const sql = `
                SELECT COUNT(*) as count 
                FROM friend_requests 
                WHERE to_user = ? AND status = 'pending'
            `;
            
            const result = await db.query(sql, [username]);
            return result[0].count;
        } catch (error) {
            console.error('Error in FriendRequestModel.getPendingRequestsCount:', error);
            throw error;
        }
    }

    // عدد طلبات الصداقة المرسلة
    static async getSentRequestsCount(username) {
        try {
            const sql = `
                SELECT COUNT(*) as count 
                FROM friend_requests 
                WHERE from_user = ? AND status = 'pending'
            `;
            
            const result = await db.query(sql, [username]);
            return result[0].count;
        } catch (error) {
            console.error('Error in FriendRequestModel.getSentRequestsCount:', error);
            throw error;
        }
    }

    // تنظيف طلبات الصداقة القديمة
    static async cleanupOldRequests(daysOld = 30) {
        try {
            const sql = `
                DELETE FROM friend_requests 
                WHERE status IN ('declined', 'expired') 
                AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
            `;
            
            const result = await db.query(sql, [daysOld]);
            return result.affectedRows;
        } catch (error) {
            console.error('Error in FriendRequestModel.cleanupOldRequests:', error);
            throw error;
        }
    }

    // الحصول على الأصدقاء المتصلين حالياً
    static async getOnlineFriends(username, onlineUsers = []) {
        try {
            const friends = await this.getFriendsList(username);
            const onlineFriends = friends.filter(friend => 
                onlineUsers.includes(friend.friend_username)
            );
            
            return onlineFriends;
        } catch (error) {
            console.error('Error in FriendRequestModel.getOnlineFriends:', error);
            throw error;
        }
    }

    // تحديث حالة طلب الصداقة إلى منتهية الصلاحية
    static async expireOldRequests(daysOld = 7) {
        try {
            const sql = `
                UPDATE friend_requests 
                SET status = 'expired', updated_at = NOW()
                WHERE status = 'pending' 
                AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
            `;
            
            const result = await db.query(sql, [daysOld]);
            return result.affectedRows;
        } catch (error) {
            console.error('Error in FriendRequestModel.expireOldRequests:', error);
            throw error;
        }
    }
}

module.exports = FriendRequestModel;