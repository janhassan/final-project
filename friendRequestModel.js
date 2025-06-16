const db = require('../db');

class FriendRequestModel {
    
    // إرسال طلب صداقة
    static async sendFriendRequest(fromUser, toUser) {
        try {
            // التحقق من صحة البيانات
            if (!fromUser || !toUser) {
                throw new Error('من فضلك قم بتوفير أسماء المستخدمين');
            }

            if (fromUser === toUser) {
                throw new Error('لا يمكنك إرسال طلب صداقة لنفسك');
            }

            // التحقق من وجود المستخدم المستقبل
            const targetUserExists = await this.checkUserExists(toUser);
            if (!targetUserExists) {
                throw new Error('المستخدم المطلوب غير موجود');
            }

            // التحقق من وجود طلب سابق
            const existingRequest = await this.getExistingRequest(fromUser, toUser);
            if (existingRequest) {
                throw new Error('يوجد طلب صداقة بالفعل');
            }

            // التحقق من كونهما أصدقاء بالفعل
            const alreadyFriends = await this.areFriends(fromUser, toUser);
            if (alreadyFriends) {
                throw new Error('أنتما أصدقاء بالفعل');
            }

            const sql = `
                INSERT INTO friend_requests 
                (from_user, to_user, status, created_at)
                VALUES (?, ?, 'pending', NOW())
            `;
            
            const [result] = await db.query(sql, [fromUser, toUser]);
            
            return {
                id: result.insertId,
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

    // التحقق من وجود المستخدم
    static async checkUserExists(username) {
        try {
            const sql = 'SELECT username FROM users WHERE username = ?';
            const [rows] = await db.query(sql, [username]);
            return rows.length > 0;
        } catch (error) {
            console.error('Error checking user existence:', error);
            throw error;
        }
    }

    // الحصول على طلبات الصداقة الواردة
    static async getIncomingRequests(username) {
        try {
            const sql = `
                SELECT 
                    fr.id,
                    fr.from_user,
                    fr.to_user,
                    fr.status,
                    fr.created_at,
                    fr.updated_at,
                    u.name as from_user_name,
                    u.avatar as from_user_avatar
                FROM friend_requests fr
                LEFT JOIN users u ON fr.from_user = u.username
                WHERE fr.to_user = ? AND fr.status = 'pending'
                ORDER BY fr.created_at DESC
            `;
            const [rows] = await db.query(sql, [username]);
            return rows;
        } catch (error) {
            console.error('Error in FriendRequestModel.getIncomingRequests:', error);
            throw error;
        }
    }

    // للتوافق مع الكود الموجود
    static async getPendingRequests(username) {
        return await this.getIncomingRequests(username);
    }

    // الحصول على طلبات الصداقة الصادرة
    static async getOutgoingRequests(username) {
        try {
            const sql = `
                SELECT 
                    fr.id,
                    fr.from_user,
                    fr.to_user,
                    fr.status,
                    fr.created_at,
                    fr.updated_at,
                    u.name as to_user_name,
                    u.avatar as to_user_avatar
                FROM friend_requests fr
                LEFT JOIN users u ON fr.to_user = u.username
                WHERE fr.from_user = ? AND fr.status = 'pending'
                ORDER BY fr.created_at DESC
            `;
            
            const [rows] = await db.query(sql, [username]);
            return rows;
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
                throw new Error('استجابة غير صحيحة. يجب أن تكون "accepted" أو "declined"');
            }

            // الحصول على تفاصيل الطلب
            const request = await this.getRequestById(requestId);
            if (!request) {
                throw new Error('طلب الصداقة غير موجود');
            }

            if (request.status !== 'pending') {
                throw new Error('تم التعامل مع طلب الصداقة بالفعل');
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
            const [rows] = await db.query(sql, [requestId]);
            return rows[0] || null;
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
            
            const [rows] = await db.query(sql, [fromUser, toUser, toUser, fromUser]);
            return rows[0] || null;
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
            
            const [rows] = await db.query(sql, [user1, user2, user2, user1]);
            return rows.length > 0;
        } catch (error) {
            console.error('Error in FriendRequestModel.areFriends:', error);
            throw error;
        }
    }

    // إضافة صداقة جديدة
    static async addFriendship(user1, user2) {
        try {
            // ترتيب أسماء المستخدمين أبجدياً لتجنب التكرار
            const [sortedUser1, sortedUser2] = [user1, user2].sort();
            
            const sql = `
                INSERT INTO friends 
                (user1, user2, created_at)
                VALUES (?, ?, NOW())
            `;
            
            await db.query(sql, [sortedUser1, sortedUser2]);
            
            return true;
        } catch (error) {
            // التحقق من خطأ التكرار
            if (error.code === 'ER_DUP_ENTRY') {
                console.log('Friendship already exists');
                return true;
            }
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
                        WHEN f.user1 = ? THEN f.user2
                        ELSE f.user1
                    END as friend_username,
                    f.created_at,
                    u.name as friend_name,
                    u.avatar as friend_avatar,
                    u.online_status as friend_online,
                    u.status as friend_status
                FROM friends f
                LEFT JOIN users u ON (
                    CASE 
                        WHEN f.user1 = ? THEN f.user2
                        ELSE f.user1
                    END = u.username
                )
                WHERE f.user1 = ? OR f.user2 = ?
                ORDER BY f.created_at DESC
            `;
            
            const [rows] = await db.query(sql, [username, username, username, username]);
            return rows;
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
            
            const [result] = await db.query(sql, [user1, user2, user2, user1]);
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
            const [result] = await db.query(sql, [requestId]);
            return result.affectedRows > 0;
        } catch (error) {
            console.error('Error in FriendRequestModel.deleteFriendRequest:', error);
            throw error;
        }
    }

    // إلغاء طلب صداقة مرسل
    static async cancelFriendRequest(fromUser, toUser) {
        try {
            const sql = `
                DELETE FROM friend_requests 
                WHERE from_user = ? AND to_user = ? AND status = 'pending'
            `;
            const [result] = await db.query(sql, [fromUser, toUser]);
            return result.affectedRows > 0;
        } catch (error) {
            console.error('Error in FriendRequestModel.cancelFriendRequest:', error);
            throw error;
        }
    }

    // البحث عن المستخدمين للإضافة كأصدقاء
    static async searchUsers(searchTerm, currentUser, limit = 10) {
        try {
            const sql = `
                SELECT 
                    username,
                    name,
                    avatar,
                    online_status,
                    created_at
                FROM users 
                WHERE (username LIKE ? OR name LIKE ?)
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
            
            const searchPattern = `%${searchTerm}%`;
            const [rows] = await db.query(sql, [
                searchPattern,
                searchPattern,
                currentUser, 
                currentUser, 
                currentUser, 
                currentUser, 
                currentUser, 
                limit
            ]);
            return rows;
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
            
            const [rows] = await db.query(sql, [username, username]);
            return rows[0].count;
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
            
            const [rows] = await db.query(sql, [username]);
            return rows[0].count;
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
            
            const [rows] = await db.query(sql, [username]);
            return rows[0].count;
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
            
            const [result] = await db.query(sql, [daysOld]);
            return result.affectedRows;
        } catch (error) {
            console.error('Error in FriendRequestModel.cleanupOldRequests:', error);
            throw error;
        }
    }

    // الحصول على الأصدقاء المتصلين حالياً
    static async getOnlineFriends(username) {
        try {
            const sql = `
                SELECT 
                    CASE 
                        WHEN f.user1 = ? THEN f.user2
                        ELSE f.user1
                    END as friend_username,
                    u.name as friend_name,
                    u.avatar as friend_avatar,
                    u.online_status as friend_online,
                    u.status as friend_status
                FROM friends f
                LEFT JOIN users u ON (
                    CASE 
                        WHEN f.user1 = ? THEN f.user2
                        ELSE f.user1
                    END = u.username
                )
                WHERE (f.user1 = ? OR f.user2 = ?) AND u.online_status = 1
                ORDER BY f.created_at DESC
            `;
            
            const [rows] = await db.query(sql, [username, username, username, username]);
            return rows;
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
            
            const [result] = await db.query(sql, [daysOld]);
            return result.affectedRows;
        } catch (error) {
            console.error('Error in FriendRequestModel.expireOldRequests:', error);
            throw error;
        }
    }

    // تحديث حالة المستخدم أونلاين
    static async updateUserOnlineStatus(username, isOnline) {
        try {
            const sql = `
                UPDATE users 
                SET online_status = ?, updated_at = NOW()
                WHERE username = ?
            `;
            
            const [result] = await db.query(sql, [isOnline ? 1 : 0, username]);
            return result.affectedRows > 0;
        } catch (error) {
            console.error('Error updating user online status:', error);
            throw error;
        }
    }
}

module.exports = FriendRequestModel;
