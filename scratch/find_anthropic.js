const fs = require('fs');
const path = require('path');

const mpPath = 'C:\\Users\\CaesarEmperor\\.dsh\\agent-skills\\claude-plugin-market\\market\\anthropic\\.claude-plugin\\marketplace.json';
const data = JSON.parse(fs.readFileSync(mpPath, 'utf8'));

const anthropicPlugins = [];
for (const p of data.plugins) {
    const authorName = (p.author && p.author.name) || (typeof p.author === 'string' ? p.author : '');
    const isLocal = typeof p.source === 'string' && p.source.startsWith('./');
    if (authorName.toLowerCase() === 'anthropic' || isLocal) {
        anthropicPlugins.push({
            name: p.name,
            author: authorName,
            source: p.source,
            category: p.category
        });
    }
}

console.log('Total Anthropic / Local plugins:', anthropicPlugins.length);
console.log(anthropicPlugins.map(p => p.name));
