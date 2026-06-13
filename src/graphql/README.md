# GraphQL Schema - Twitter Clone Social Media App

This directory contains the modular GraphQL schema definitions organized by domain.

## File Structure

### Core Definitions

- **scalars.graphql** - Custom scalar types (DateTime, Upload, JSON)
- **enums.graphql** - All enumeration types

### Type Definitions

- **user.graphql** - User account types and relationships
- **post.graphql** - Post/Tweet types and variations
- **media.graphql** - Media attachments (images, videos, GIFs)
- **hashtag.graphql** - Hashtag types
- **interaction.graphql** - User interactions (Like, Bookmark, Follow, Block)
- **notification.graphql** - Notification and alert types

### Utility Types

- **pagination.graphql** - Cursor-based pagination types
- **auth.graphql** - Authentication tokens and payloads
- **search.graphql** - Search result types
- **trend.graphql** - Trending content types
- **error.graphql** - Error handling types

### Operations

- **input.graphql** - All input types for mutations
- **query.graphql** - Root Query type with all query operations
- **mutation.graphql** - Root Mutation type with all mutations
- **subscription.graphql** - Real-time subscriptions

## Setup Instructions

### Option 1: Using Apollo Server with Schema Merging

```javascript
import { loadFilesSync } from "@graphql-tools/load-files";
import { mergeTypeDefs } from "@graphql-tools/merge";
import path from "path";

const typesArray = loadFilesSync(path.join(__dirname, "./graphql"), {
	extensions: ["graphql"],
});

const typeDefs = mergeTypeDefs(typesArray);
```

### Option 2: Using graphql-merge

```bash
npm install graphql-merge
```

```bash
graphql-merge 'src/graphql/**/*.graphql' -o dist/schema.graphql
```

### Option 3: Using graphql-tools with schema stitching

```javascript
import { makeExecutableSchema } from "graphql-tools";
import { loadFilesSync } from "@graphql-tools/load-files";

const typesArray = loadFilesSync(path.join(__dirname, "./graphql"));
const schema = makeExecutableSchema({ typeDefs: typesArray });
```

### Option 4: Manual concatenation (for development)

Combine all `.graphql` files in order:

1. scalars.graphql
2. enums.graphql
3. user.graphql, post.graphql, media.graphql, hashtag.graphql
4. interaction.graphql, notification.graphql
5. pagination.graphql, auth.graphql, search.graphql, trend.graphql, error.graphql
6. input.graphql
7. query.graphql, mutation.graphql, subscription.graphql

## Key Features

### User Management

- User profiles with followers/following
- User verification status
- Block and privacy controls

### Post Types

- Regular tweets
- Replies (threaded conversations)
- Retweets (amplification)
- Quote tweets (commentary)

### Interactions

- Liking posts
- Bookmarking for later
- Following/unfollowing users
- Blocking users

### Discovery

- Full-text search (users, posts, hashtags)
- Trending hashtags
- Explore feed
- Trending trends

### Real-Time

- WebSocket subscriptions for new posts
- Notification events
- Activity streams

### Pagination

- Cursor-based pagination for efficient queries
- Support for limit/offset pagination

## Related Resolvers

Each type definition should have corresponding resolvers in your server implementation:

- `src/resolvers/user.js`
- `src/resolvers/post.js`
- `src/resolvers/interaction.js`
- `src/resolvers/notification.js`
- etc.

## Example Queries

### Get Home Timeline

```graphql
query {
	homeTimeline(limit: 20, offset: 0) {
		edges {
			node {
				id
				content
				author {
					username
					displayName
					profileImage
				}
				likesCount
				repliesCount
				isLiked
			}
		}
		pageInfo {
			hasNextPage
			endCursor
		}
	}
}
```

### Create a Post

```graphql
mutation {
	createPost(input: { content: "Hello, world!", media: [], hashtags: ["hello", "graphql"] }) {
		id
		content
		createdAt
	}
}
```

### Search Users and Posts

```graphql
query {
	search(query: "javascript", limit: 10) {
		users {
			id
			username
			displayName
		}
		posts {
			id
			content
			author {
				username
			}
		}
	}
}
```

## Notes

- All types use `DateTime` for timestamps (ISO 8601 format)
- Counts are eagerly loaded for better UX
- Booleans like `isLiked` and `isFollowing` are computed based on context
- Connection types use cursor-based pagination for scalability
- Subscriptions require WebSocket support (e.g., graphql-ws)
