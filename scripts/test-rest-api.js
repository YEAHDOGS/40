import assert from 'assert';

const BASE_URL = process.argv[2] || 'http://localhost:5173';
console.log(`Starting REST API tests against: ${BASE_URL}\n`);

const randomId = Math.random().toString(36).substring(7);
const user1 = {
    username: `tester1_${randomId}`,
    email: `tester1_${randomId}@example.com`,
    displayName: 'Test User 1'
};

const user2 = {
    username: `tester2_${randomId}`,
    email: `tester2_${randomId}@example.com`,
    displayName: 'Test User 2'
};

let token1 = null;
let token2 = null;
let createdPostId = null;

async function runTests() {
    try {
        // 1. Health check
        console.log('> Testing GET /api/AllIsGood...');
        const healthRes = await fetch(`${BASE_URL}/api/AllIsGood`);
        assert.strictEqual(healthRes.status, 200, 'Health check should return 200');
        const healthData = await healthRes.json();
        assert.strictEqual(healthData.status, 'ok', 'Health status should be "ok"');
        console.log('  [PASS] Health check OK\n');

        // 2. Signup User 1
        console.log('> Testing POST /api/auth/signup (User 1)...');
        const signup1Res = await fetch(`${BASE_URL}/api/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(user1)
        });
        assert.strictEqual(signup1Res.status, 201, 'Signup should return 201');
        const signup1Data = await signup1Res.json();
        assert.ok(signup1Data.token?.accessToken, 'Should return accessToken');
        assert.strictEqual(signup1Data.user.username, user1.username, 'Usernames should match');
        token1 = signup1Data.token.accessToken;
        console.log(`  [PASS] User 1 signed up. Token received: ${token1.substring(0, 15)}...\n`);

        // 3. Signup User 2
        console.log('> Testing POST /api/auth/signup (User 2)...');
        const signup2Res = await fetch(`${BASE_URL}/api/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(user2)
        });
        assert.strictEqual(signup2Res.status, 201, 'Signup should return 201');
        const signup2Data = await signup2Res.json();
        assert.ok(signup2Data.token?.accessToken, 'Should return accessToken');
        token2 = signup2Data.token.accessToken;
        console.log(`  [PASS] User 2 signed up.\n`);

        // 4. Create post as User 1
        console.log('> Testing POST /api/posts (Create post as User 1)...');
        const createPostRes = await fetch(`${BASE_URL}/api/posts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token1}`
            },
            body: JSON.stringify({
                content: 'This is my first post via REST API!',
                media: [{ url: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5', type: 'IMAGE' }]
            })
        });
        assert.strictEqual(createPostRes.status, 201, 'Create post should return 201');
        const postData = await createPostRes.json();
        assert.ok(postData.id, 'Post should have an ID');
        assert.strictEqual(postData.content, 'This is my first post via REST API!');
        assert.strictEqual(postData.author.username, user1.username, 'Author username should match User 1');
        assert.strictEqual(postData.media.length, 1, 'Media should have 1 item');
        createdPostId = postData.id;
        console.log(`  [PASS] Created post ID: ${createdPostId}\n`);

        // 5. Fetch posts list
        console.log('> Testing GET /api/posts...');
        const getPostsRes = await fetch(`${BASE_URL}/api/posts?limit=5`);
        assert.strictEqual(getPostsRes.status, 200, 'Get posts list should return 200');
        const listData = await getPostsRes.json();
        assert.ok(Array.isArray(listData.posts), 'Posts should be an array');
        assert.ok(listData.posts.some(p => p.id === createdPostId), 'List should contain the created post');
        console.log(`  [PASS] Successfully retrieved posts list (total count: ${listData.totalCount})\n`);

        // 6. Fetch single post
        console.log(`> Testing GET /api/posts/${createdPostId}...`);
        const getSingleRes = await fetch(`${BASE_URL}/api/posts/${createdPostId}`);
        assert.strictEqual(getSingleRes.status, 200, 'Get single post should return 200');
        const singleData = await getSingleRes.json();
        assert.strictEqual(singleData.id, createdPostId, 'Fetched post ID should match');
        console.log(`  [PASS] Single post fetched successfully.\n`);

        // 7. Verify permission: User 2 trying to update User 1's post (Should fail with 403)
        console.log(`> Testing PUT /api/posts/${createdPostId} as User 2 (Should Fail)...`);
        const updateFailRes = await fetch(`${BASE_URL}/api/posts/${createdPostId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token2}`
            },
            body: JSON.stringify({ content: 'Malicious update attempt' })
        });
        assert.strictEqual(updateFailRes.status, 403, 'Should be 403 Forbidden');
        const updateFailData = await updateFailRes.json();
        assert.ok(updateFailData.error.includes('Forbidden'), 'Error message should mention Forbidden');
        console.log(`  [PASS] Denied modification correctly (403 Forbidden: "${updateFailData.error}")\n`);

        // 8. Verify permission: User 2 trying to delete User 1's post (Should fail with 403)
        console.log(`> Testing DELETE /api/posts/${createdPostId} as User 2 (Should Fail)...`);
        const deleteFailRes = await fetch(`${BASE_URL}/api/posts/${createdPostId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token2}`
            }
        });
        assert.strictEqual(deleteFailRes.status, 403, 'Should be 403 Forbidden');
        const deleteFailData = await deleteFailRes.json();
        assert.ok(deleteFailData.error.includes('Forbidden'), 'Error message should mention Forbidden');
        console.log(`  [PASS] Denied deletion correctly (403 Forbidden: "${deleteFailData.error}")\n`);

        // 9. Update post as User 1 (Should succeed)
        console.log(`> Testing PUT /api/posts/${createdPostId} as User 1 (Should Succeed)...`);
        const updateSucceedRes = await fetch(`${BASE_URL}/api/posts/${createdPostId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token1}`
            },
            body: JSON.stringify({ content: 'This post is updated!' })
        });
        assert.strictEqual(updateSucceedRes.status, 200, 'Should return 200');
        const updateSucceedData = await updateSucceedRes.json();
        assert.strictEqual(updateSucceedData.content, 'This post is updated!', 'Post content should be updated');
        console.log(`  [PASS] Post content updated successfully.\n`);

        // 10. Update user profile as User 1 (Should succeed)
        console.log(`> Testing PUT /api/users/profile (Update Profile as User 1)...`);
        const profileRes = await fetch(`${BASE_URL}/api/users/profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token1}`
            },
            body: JSON.stringify({
                bio: 'Software engineer testing REST APIs.',
                music: 'Electronic, Synthwave'
            })
        });
        assert.strictEqual(profileRes.status, 200, 'Profile update should return 200');
        const profileData = await profileRes.json();
        assert.strictEqual(profileData.bio, 'Software engineer testing REST APIs.');
        assert.strictEqual(profileData.music, 'Electronic, Synthwave');
        console.log(`  [PASS] User profile updated successfully.\n`);

        // 11. Fetch user's details and posts
        console.log(`> Testing GET /api/users/${user1.username}...`);
        const userDetailsRes = await fetch(`${BASE_URL}/api/users/${user1.username}`);
        assert.strictEqual(userDetailsRes.status, 200, 'Fetch user profile should return 200');
        const userDetailsData = await userDetailsRes.json();
        assert.strictEqual(userDetailsData.user.username, user1.username);
        assert.ok(userDetailsData.posts.length > 0, 'Posts list should not be empty');
        console.log(`  [PASS] User details and posts retrieved successfully.\n`);

        // 12. Delete post as User 1 (Should succeed)
        console.log(`> Testing DELETE /api/posts/${createdPostId} as User 1 (Should Succeed)...`);
        const deleteRes = await fetch(`${BASE_URL}/api/posts/${createdPostId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token1}`
            }
        });
        assert.strictEqual(deleteRes.status, 200, 'Should return 200');
        const deleteData = await deleteRes.json();
        assert.strictEqual(deleteData.success, true);
        console.log(`  [PASS] Post deleted successfully.\n`);

        // 13. Verify post is deleted
        console.log(`> Fetching /api/posts/${createdPostId} again (Should return 404)...`);
        const checkDeletedRes = await fetch(`${BASE_URL}/api/posts/${createdPostId}`);
        assert.strictEqual(checkDeletedRes.status, 404, 'Post should be missing (404)');
        console.log(`  [PASS] Verified post is gone.\n`);

        // 14. Logout User 1
        console.log('> Testing POST /api/auth/logout...');
        const logoutRes = await fetch(`${BASE_URL}/api/auth/logout`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token1}`
            }
        });
        assert.strictEqual(logoutRes.status, 200, 'Logout should succeed');
        console.log(`  [PASS] User 1 logged out.\n`);

        // 15. Verify token is revoked (subsequent POST should fail with 401)
        console.log('> Creating post with revoked token (Should Fail with 401)...');
        const createFailRes = await fetch(`${BASE_URL}/api/posts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token1}`
            },
            body: JSON.stringify({ content: 'Post with expired token' })
        });
        assert.strictEqual(createFailRes.status, 401, 'Should return 401 Unauthorized');
        console.log(`  [PASS] Revoked token blocked correctly (401 Unauthorized).\n`);

        console.log('=== ALL TESTS PASSED SUCCESSFULLY! ===');
    } catch (err) {
        console.error('  [FAIL] Test assertion failed:', err.message);
        process.exit(1);
    }
}

runTests();
