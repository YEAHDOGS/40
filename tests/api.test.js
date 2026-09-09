import test from 'node:test';
import assert from 'node:assert';
import './db-test-env.js'; // provision a throwaway sqlite DB if DATABASE_URL unset
import { Readable } from 'stream';
import { restApiHandler } from '../src/server/rest.js';

// Helper to create mock request stream
function createMockReq(method, url, headers = {}, body = null) {
    const req = new Readable({
        read() {}
    });
    req.method = method;
    req.url = url;
    req.headers = headers;
    if (body) {
        req.push(JSON.stringify(body));
    }
    req.push(null);
    return req;
}

// Helper to create mock response stream
function createMockRes() {
    let resolveFn;
    const promise = new Promise((resolve) => {
        resolveFn = resolve;
    });

    const res = {
        statusCode: 200,
        headers: {},
        body: '',
        writeHead(status, headers) {
            this.statusCode = status;
            Object.assign(this.headers, headers);
            return this;
        },
        end(chunk) {
            if (chunk) {
                this.body += chunk;
            }
            resolveFn(this);
        },
        wait() {
            return promise;
        }
    };
    return res;
}

test('REST API Handler Unit Tests', async (t) => {
    
    await t.test('GET /api/AllIsGood - Health Check routing', async () => {
        const req = createMockReq('GET', '/api/AllIsGood');
        const res = createMockRes();
        let nextCalled = false;
        
        await restApiHandler(req, res, () => {
            nextCalled = true;
        });

        const completedRes = await res.wait();
        
        assert.strictEqual(completedRes.statusCode, 200);
        assert.strictEqual(completedRes.headers['Content-Type'], 'application/json');
        
        const data = JSON.parse(completedRes.body);
        assert.strictEqual(data.status, 'ok');
        assert.strictEqual(data.message, 'All is good');
        assert.strictEqual(nextCalled, false, 'Should not pass through to next middleware');
    });

    await t.test('POST /api/auth/signup - Validation of required fields', async () => {
        const req = createMockReq('POST', '/api/auth/signup', {}, {
            username: 'missing_email_and_display_name'
        });
        const res = createMockRes();
        
        await restApiHandler(req, res, () => {});
        const completedRes = await res.wait();

        assert.strictEqual(completedRes.statusCode, 400);
        const data = JSON.parse(completedRes.body);
        assert.ok(data.error.includes('email is required'));
    });

    await t.test('POST /api/auth/signup - Rejects missing password', async () => {
        const req = createMockReq('POST', '/api/auth/signup', {}, {
            username: 'no_password_user',
            email: 'no_password@example.com',
            displayName: 'No Password'
        });
        const res = createMockRes();

        await restApiHandler(req, res, () => {});
        const completedRes = await res.wait();

        assert.strictEqual(completedRes.statusCode, 400);
        const data = JSON.parse(completedRes.body);
        assert.ok(data.error.includes('password is required'));
    });

    await t.test('POST /api/auth/signup + login - scrypt round trip, hash never leaks', async () => {
        const tag = Math.random().toString(36).substring(7);
        const username = `auth_roundtrip_${tag}`;
        const email = `auth_roundtrip_${tag}@example.com`;

        // 1. Signup stores a hash, returns no passwordHash
        const signupReq = createMockReq('POST', '/api/auth/signup', {}, {
            username,
            email,
            displayName: 'Auth Roundtrip',
            password: 'hunter2-hunter2'
        });
        const signupRes = createMockRes();
        await restApiHandler(signupReq, signupRes, () => {});
        const signupResult = await signupRes.wait();
        assert.strictEqual(signupResult.statusCode, 201);
        const signupData = JSON.parse(signupResult.body);
        assert.ok(!('passwordHash' in signupData.user), 'passwordHash must not leak in signup response');

        // 2. Wrong password -> 401, generic message
        const badLoginReq = createMockReq('POST', '/api/auth/login', {}, {
            username,
            password: 'definitely-wrong'
        });
        const badLoginRes = createMockRes();
        await restApiHandler(badLoginReq, badLoginRes, () => {});
        const badLoginResult = await badLoginRes.wait();
        assert.strictEqual(badLoginResult.statusCode, 401);
        assert.ok(JSON.parse(badLoginResult.body).error.includes('Invalid credentials'));

        // 3. Login without password -> 400
        const noPassReq = createMockReq('POST', '/api/auth/login', {}, { username });
        const noPassRes = createMockRes();
        await restApiHandler(noPassReq, noPassRes, () => {});
        const noPassResult = await noPassRes.wait();
        assert.strictEqual(noPassResult.statusCode, 400);

        // 4. Correct password -> 200 with token, no passwordHash
        const goodLoginReq = createMockReq('POST', '/api/auth/login', {}, {
            username,
            password: 'hunter2-hunter2'
        });
        const goodLoginRes = createMockRes();
        await restApiHandler(goodLoginReq, goodLoginRes, () => {});
        const goodLoginResult = await goodLoginRes.wait();
        assert.strictEqual(goodLoginResult.statusCode, 200);
        const goodLoginData = JSON.parse(goodLoginResult.body);
        assert.ok(goodLoginData.token.accessToken, 'login returns a token');
        assert.ok(!('passwordHash' in goodLoginData.user), 'passwordHash must not leak in login response');
    });

    await t.test('POST /api/auth/login - Validation of username and password', async () => {
        // No username at all -> username check fires first
        const req = createMockReq('POST', '/api/auth/login', {}, {});
        const res = createMockRes();

        await restApiHandler(req, res, () => {});
        const completedRes = await res.wait();

        assert.strictEqual(completedRes.statusCode, 400);
        const data = JSON.parse(completedRes.body);
        assert.ok(data.error.includes('username is required'));

        // Username present, password missing -> password check fires
        const req2 = createMockReq('POST', '/api/auth/login', {}, { username: 'nobody' });
        const res2 = createMockRes();
        await restApiHandler(req2, res2, () => {});
        const completedRes2 = await res2.wait();
        assert.strictEqual(completedRes2.statusCode, 400);
        assert.ok(JSON.parse(completedRes2.body).error.includes('password is required'));
    });

    await t.test('POST /api/posts - Authorization Guard blocks anonymous creation', async () => {
        const req = createMockReq('POST', '/api/posts', {}, {
            content: 'Should fail'
        });
        const res = createMockRes();
        
        await restApiHandler(req, res, () => {});
        const completedRes = await res.wait();

        assert.strictEqual(completedRes.statusCode, 401);
        const data = JSON.parse(completedRes.body);
        assert.ok(data.error.includes('Unauthorized'));
    });

    await t.test('GET /api/posts - Anonymous read denied (content is member-only)', async () => {
        const req = createMockReq('GET', '/api/posts');
        const res = createMockRes();

        await restApiHandler(req, res, () => {});
        const completedRes = await res.wait();

        assert.strictEqual(completedRes.statusCode, 401);
        const data = JSON.parse(completedRes.body);
        assert.ok(data.error.includes('Unauthorized'));
    });

    await t.test('GET /api/posts/:id - Anonymous read denied (content is member-only)', async () => {
        const req = createMockReq('GET', '/api/posts/some-id');
        const res = createMockRes();

        await restApiHandler(req, res, () => {});
        const completedRes = await res.wait();

        assert.strictEqual(completedRes.statusCode, 401);
    });

    await t.test('GET /api/users/:username - Anonymous read denied (content is member-only)', async () => {
        const req = createMockReq('GET', '/api/users/someone');
        const res = createMockRes();

        await restApiHandler(req, res, () => {});
        const completedRes = await res.wait();

        assert.strictEqual(completedRes.statusCode, 401);
    });

    await t.test('PUT /api/users/profile - Authorization Guard blocks anonymous update', async () => {
        const req = createMockReq('PUT', '/api/users/profile', {}, {
            bio: 'New bio'
        });
        const res = createMockRes();
        
        await restApiHandler(req, res, () => {});
        const completedRes = await res.wait();

        assert.strictEqual(completedRes.statusCode, 401);
        const data = JSON.parse(completedRes.body);
        assert.ok(data.error.includes('Unauthorized'));
    });

    await t.test('GET /api/unknown-route - Passes through to next middleware', async () => {
        const req = createMockReq('GET', '/api/unknown-route');
        const res = createMockRes();
        let nextCalled = false;
        
        await restApiHandler(req, res, () => {
            nextCalled = true;
        });

        // The handler is expected to call next() and not end the response
        assert.strictEqual(nextCalled, true, 'Should invoke next() middleware');
    });

    await t.test('POST /api/posts & GET /api/posts/:id - Comment creation and detail retrieval', async () => {
        // 1. Signup a user
        const signupReq = createMockReq('POST', '/api/auth/signup', {}, {
            username: `unit_tester_${Math.random().toString(36).substring(7)}`,
            email: `unit_tester_${Math.random().toString(36).substring(7)}@example.com`,
            displayName: 'Unit Tester',
            password: 'test-password-123'
        });
        const signupRes = createMockRes();
        await restApiHandler(signupReq, signupRes, () => {});
        const signupResult = await signupRes.wait();
        
        assert.strictEqual(signupResult.statusCode, 201);
        const signupData = JSON.parse(signupResult.body);
        const token = signupData.token.accessToken;

        // 2. Create a parent post
        const createPostReq = createMockReq('POST', '/api/posts', {
            'authorization': `Bearer ${token}`
        }, {
            content: 'Parent Post Content'
        });
        const createPostRes = createMockRes();
        await restApiHandler(createPostReq, createPostRes, () => {});
        const createPostResult = await createPostRes.wait();
        
        assert.strictEqual(createPostResult.statusCode, 201);
        const parentPost = JSON.parse(createPostResult.body);
        const parentPostId = parentPost.id;

        // 3. Create a comment (replyToId set to parentPostId)
        const createCommentReq = createMockReq('POST', '/api/posts', {
            'authorization': `Bearer ${token}`
        }, {
            content: 'This is a comment to parent post',
            replyToId: parentPostId
        });
        const createCommentRes = createMockRes();
        await restApiHandler(createCommentReq, createCommentRes, () => {});
        const createCommentResult = await createCommentRes.wait();
        
        assert.strictEqual(createCommentResult.statusCode, 201);
        const commentPost = JSON.parse(createCommentResult.body);
        assert.strictEqual(commentPost.replyToId, parentPostId);

        // 4. Retrieve single post details (content reads require a token)
        const getPostReq = createMockReq('GET', `/api/posts/${parentPostId}`, {
            'authorization': `Bearer ${token}`
        });
        const getPostRes = createMockRes();
        await restApiHandler(getPostReq, getPostRes, () => {});
        const getPostResult = await getPostRes.wait();
        
        assert.strictEqual(getPostResult.statusCode, 200);
        const retrievedPost = JSON.parse(getPostResult.body);
        assert.strictEqual(retrievedPost.id, parentPostId);
        assert.strictEqual(retrievedPost.content, 'Parent Post Content');
    });

    await t.test('REST input validation - nastiest payloads get 400, never 500', async () => {
        // Fresh user for an auth token
        const tag = Math.random().toString(36).substring(7);
        const signupReq = createMockReq('POST', '/api/auth/signup', {}, {
            username: `rest_val_${tag}`,
            email: `rest_val_${tag}@example.com`,
            displayName: 'REST Validation',
            password: 'hunter2-hunter2'
        });
        const signupRes = createMockRes();
        await restApiHandler(signupReq, signupRes, () => {});
        const signupData = JSON.parse((await signupRes.wait()).body);
        const headers = { 'authorization': `Bearer ${signupData.token.accessToken}` };

        const post = async (url, body) => {
            const req = createMockReq('POST', url, headers, body);
            const res = createMockRes();
            await restApiHandler(req, res, () => {});
            return res.wait();
        };

        // 100k-char content bomb
        const bomb = await post('/api/posts', { content: 'x'.repeat(100_000) });
        assert.strictEqual(bomb.statusCode, 400);
        assert.ok(JSON.parse(bomb.body).error.includes('at most 2000'));

        // Bad media type
        const badMedia = await post('/api/posts', {
            content: 'x',
            media: [{ url: 'https://x.co/i.png', type: 'EXE' }]
        });
        assert.strictEqual(badMedia.statusCode, 400);
        assert.ok(JSON.parse(badMedia.body).error.includes('must be one of'));

        // Nested object smuggled as content (no Prisma 500)
        const nested = await post('/api/posts', { content: { nested: 'object' } });
        assert.strictEqual(nested.statusCode, 400);

        // __proto__ smuggled into a profile update
        const protoBody = JSON.parse('{"bio":"x","__proto__":{"admin":true}}');
        const protoReq = createMockReq('PUT', '/api/users/profile', headers, protoBody);
        const protoRes = createMockRes();
        await restApiHandler(protoReq, protoRes, () => {});
        const protoResult = await protoRes.wait();
        assert.strictEqual(protoResult.statusCode, 400);
        assert.ok(JSON.parse(protoResult.body).error.includes('Forbidden key'));

        // Overlong bio
        const longBioReq = createMockReq('PUT', '/api/users/profile', headers, { bio: 'x'.repeat(10_000) });
        const longBioRes = createMockRes();
        await restApiHandler(longBioReq, longBioRes, () => {});
        const longBioResult = await longBioRes.wait();
        assert.strictEqual(longBioResult.statusCode, 400);
        assert.ok(JSON.parse(longBioResult.body).error.includes('at most 500'));
    });

});
