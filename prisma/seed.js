import 'dotenv/config';
import pkg from '@prisma/client';
const { PrismaClient } = pkg;

const prisma = new PrismaClient();

const mockContents = [
	"They're tracking the metadata, not the message. Remember to rotate your encryption keys before the wipe. #opsec",
	"Just found out about 40Forty. Finally a place where I can speak freely without some corporate algorithm shadowbanning me. 🏴‍☠️",
	"The new Matrix theme is insane. It genuinely feels like I'm jacking into the mainframe.",
	"Does anyone else feel like the internet died in 2018? Everything now is just bots talking to bots to sell ads to humans.",
	"Just a reminder: everything on this server gets zeroed out in 14 days. Don't post anything you need to keep.",
	"Who else is using a burner device to access this node? Better safe than sorry.",
	"Spotted a corporate crawler trying to index the public feeds. IP banned them immediately. Nice try, fed.",
	"I miss the days when you could just browse a forum without needing 2FA and a blood sample.",
	"The temporary nature of this network is actually so liberating. No digital footprint, no past mistakes haunting you.",
	"Anyone got any good recommendations for open-source hardware wallets? Asking for a friend.",
	"If you're reading this, you are the resistance. Let's keep the decentralized dream alive.",
	"Just successfully compiled my custom kernel. It's the little victories.",
	"L33tcode is just modern day alchemy. Change my mind.",
	"Why does every social media app eventually turn into a shopping mall? Let's keep this place clean.",
	"Waking up and realizing your data isn't being harvested feels incredibly good.",
	"The aesthetic of this app makes me want to put on a leather trench coat and hack a mega-corporation.",
	"System wipe approaching in T-minus 15 days. Prepare to zero out your local caches.",
	"I'm building a custom scraper just to save these posts before they disappear forever.",
	"Wait, if everything deletes itself, what's the point of farming likes? Exactly. Just post.",
	"I found a vulnerability in the latest chromium engine. Dropping the zero-day payload in the premium random chat tonight."
];

const mockNames = [
	"ZeroCool", "AcidBurn", "CrashOverride", "Phantom", "GhostInTheShell",
	"Cipher", "Neo", "Trinity", "Morpheus", "Switch", "Apoc", "Mouse",
	"Anon_7734", "Glitch", "Byte", "N0m4d", "R00t", "SysAdmin", "NeuralNet",
	"CyberPunk", "NetRunner", "DataGhost", "VoidWalker"
];

async function main() {
	console.log('Seeding database...');

	// Create 10 mock users
	const users = [];
	for (let i = 0; i < 10; i++) {
		const name = mockNames[Math.floor(Math.random() * mockNames.length)];
		const username = name.toLowerCase() + '_' + Math.floor(Math.random() * 10000);
		const user = await prisma.user.create({
			data: {
				username,
				displayName: name,
				email: `${username}@secure.net`,
				profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + username,
				verified: Math.random() > 0.8
			}
		});
		users.push(user);
	}

	// Create 20 mock posts
	for (let i = 0; i < 20; i++) {
		const author = users[Math.floor(Math.random() * users.length)];
		const content = mockContents[i % mockContents.length];

		const post = await prisma.post.create({
			data: {
				content,
				authorId: author.id,
				createdAt: new Date(Date.now() - Math.random() * 1000000000)
			}
		});

		// Random likes for the post
		const numLikes = Math.floor(Math.random() * 5);
		for (let j = 0; j < numLikes; j++) {
			const liker = users[Math.floor(Math.random() * users.length)];
			try {
				await prisma.like.create({
					data: {
						userId: liker.id,
						postId: post.id
					}
				});
			} catch (e) {
				// Ignore duplicate likes
			}
		}
	}

	console.log('Database seeded successfully!');
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
