# FortyForty Social Media REST API Documentation

This documentation covers the REST API endpoints exposed by the FortyForty application server. 

## Base URL
All REST API requests are prefixed with:
```
http://localhost:5173/api
```

## Authentication

Several endpoints require authentication. To access protected resources, you must include a valid JWT token in the request headers:

```http
Authorization: Bearer <your_access_token_here>
```

A token is obtained upon successful registration (`/auth/signup`) or login (`/auth/login`).

---

## Endpoint Reference

### 1. Health Check
* **Route:** `GET /AllIsGood`
* **Auth Required:** No
* **Description:** Verifies that the API server is up and responsive.
* **Success Response:**
  * **Status:** `200 OK`
  * **Body:**
    ```json
    {
      "status": "ok",
      "message": "All is good",
      "timestamp": "2026-06-17T03:03:00.000Z"
    }
    ```

### 2. Sign Up User
* **Route:** `POST /auth/signup`
* **Auth Required:** No
* **Description:** Registers a new user. Passwords are mock-validated (accepted but not stored).
* **Request Body:**
  ```json
  {
    "username": "coder_jane",
    "email": "jane@example.com",
    "displayName": "Jane Developer"
  }
  ```
* **Success Response:**
  * **Status:** `201 Created`
  * **Body:**
    ```json
    {
      "token": {
        "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
        "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
        "expiresIn": 3456000,
        "tokenType": "Bearer"
      },
      "user": {
        "id": "3b7bc077-8680-455c-bb4b-9b5f7749c2d5",
        "username": "coder_jane",
        "email": "jane@example.com",
        "displayName": "Jane Developer",
        "profileImage": "https://api.dicebear.com/7.x/avataaars/svg?seed=coder_jane",
        "verified": false,
        "createdAt": "2026-06-17T03:03:00.000Z",
        "updatedAt": "2026-06-17T03:03:00.000Z"
      }
    }
    ```

### 3. Login User
* **Route:** `POST /auth/login`
* **Auth Required:** No
* **Description:** Logs in an existing user by their username. Passwords are mock-validated.
* **Request Body:**
  ```json
  {
    "username": "coder_jane"
  }
  ```
* **Success Response:**
  * **Status:** `200 OK`
  * **Body:** (Same structure as `/auth/signup` response)

### 4. Logout User
* **Route:** `POST /auth/logout`
* **Auth Required:** Yes
* **Description:** Invalidates the current session token in the server-side Redis cache.
* **Success Response:**
  * **Status:** `200 OK`
  * **Body:**
    ```json
    {
      "success": true,
      "message": "Logged out successfully"
    }
    ```

### 5. List Posts
* **Route:** `GET /posts`
* **Auth Required:** No
* **Query Parameters:**
  * `limit` (optional, default: `50`): Number of posts to return.
  * `offset` (optional, default: `0`): Pagination offset.
* **Description:** Retrieves a list of posts in reverse chronological order.
* **Success Response:**
  * **Status:** `200 OK`
  * **Body:**
    ```json
    {
      "posts": [
        {
          "id": "dd1c9d50-ac5c-4a3c-b4f8-055fa58497b7",
          "content": "This is a post content!",
          "postType": "IMAGE",
          "createdAt": "2026-06-17T03:03:00.000Z",
          "updatedAt": "2026-06-17T03:03:00.000Z",
          "authorId": "3b7bc077-8680-455c-bb4b-9b5f7749c2d5",
          "replyToId": null,
          "repostOfId": null,
          "author": {
            "id": "3b7bc077-8680-455c-bb4b-9b5f7749c2d5",
            "username": "coder_jane",
            "displayName": "Jane Developer",
            "profileImage": "https://api.dicebear.com/7.x/avataaars/svg?seed=coder_jane",
            "verified": false
          },
          "media": [
            {
              "id": "c1f7aab5-e655-46aa-ab91-d576a9134b2f",
              "url": "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5",
              "mediaType": "IMAGE",
              "postId": "dd1c9d50-ac5c-4a3c-b4f8-055fa58497b7"
            }
          ],
          "_count": {
            "likes": 0,
            "replies": 0,
            "reposts": 0
          }
        }
      ],
      "totalCount": 21,
      "limit": 50,
      "offset": 0
    }
    ```

### 6. Create Post
* **Route:** `POST /posts`
* **Auth Required:** Yes
* **Description:** Creates a new post for the authenticated user.
* **Request Body:**
  ```json
  {
    "content": "Writing clean code is like composing music.",
    "media": [
      {
        "url": "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5",
        "type": "IMAGE"
      }
    ],
    "replyToId": null
  }
  ```
* **Success Response:**
  * **Status:** `201 Created`
  * **Body:** (Returns the created post object with author profile and media array populated)

### 7. Get Post by ID
* **Route:** `GET /posts/:id`
* **Auth Required:** No
* **Description:** Retrieves details for a specific post.
* **Success Response:**
  * **Status:** `200 OK`
  * **Body:** (Returns the post object)

### 8. Update Post
* **Route:** `PUT /posts/:id`
* **Auth Required:** Yes (Must be the author of the post)
* **Description:** Updates the text content of a post. The server verifies that the authenticated user owns the post.
* **Request Body:**
  ```json
  {
    "content": "This post is now updated with fresh thoughts!"
  }
  ```
* **Success Response:**
  * **Status:** `200 OK`
  * **Body:** (Returns the updated post object)
* **Error Responses:**
  * `403 Forbidden` if you attempt to edit another user's post.
  * `404 Not Found` if the post ID does not exist.

### 9. Delete Post
* **Route:** `DELETE /posts/:id`
* **Auth Required:** Yes (Must be the author of the post)
* **Description:** Permanently deletes a post and cascades deletion to associated likes and media records.
* **Success Response:**
  * **Status:** `200 OK`
  * **Body:**
    ```json
    {
      "success": true,
      "message": "Post deleted successfully"
    }
    ```
* **Error Responses:** (Similar to Update Post)

### 10. Get User Profile
* **Route:** `GET /users/:username`
* **Auth Required:** No
* **Description:** Retrieves profile information for a user along with all of their posts.
* **Success Response:**
  * **Status:** `200 OK`
  * **Body:**
    ```json
    {
      "user": {
        "id": "3b7bc077-8680-455c-bb4b-9b5f7749c2d5",
        "username": "coder_jane",
        "email": "jane@example.com",
        "displayName": "Jane Developer",
        "bio": "Building things with JS.",
        "profileImage": "https://api.dicebear.com/7.x/avataaars/svg?seed=coder_jane",
        "bannerImage": null,
        "verified": false,
        "movies": null,
        "books": null,
        "music": null,
        "createdAt": "2026-06-17T03:03:00.000Z",
        "updatedAt": "2026-06-17T03:03:00.000Z",
        "_count": {
          "posts": 1,
          "followers": 0,
          "following": 0
        }
      },
      "posts": [...]
    }
    ```

### 11. Update Profile
* **Route:** `PUT /users/profile`
* **Auth Required:** Yes
* **Description:** Updates the profile of the authenticated user.
* **Request Body:**
  ```json
  {
    "bio": "Senior architect. Svelte & Node advocate.",
    "displayName": "Jane Dev",
    "profileImage": "https://api.dicebear.com/7.x/avataaars/svg?seed=janedev",
    "bannerImage": "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe",
    "music": "Synthwave, Lofi",
    "books": "Clean Code, Pragmatic Programmer",
    "movies": "The Matrix"
  }
  ```
* **Success Response:**
  * **Status:** `200 OK`
  * **Body:** (Returns the updated user profile object)

---

## Common Error Statuses

| Status Code | Description | Example Body |
|:---|:---|:---|
| `400 Bad Request` | Missing required parameters or malformed request body. | `{"error": "Username is required"}` |
| `401 Unauthorized` | Missing, invalid, or expired Bearer token. | `{"error": "Unauthorized. Valid token required."}` |
| `403 Forbidden` | Trying to modify a resource that you do not own. | `{"error": "Forbidden. You do not own this post."}` |
| `404 Not Found` | The requested resource (post or user) does not exist. | `{"error": "Post not found"}` |
| `500 Internal Server Error` | Unexpected server-side exception. | `{"error": "Internal Server Error"}` |
