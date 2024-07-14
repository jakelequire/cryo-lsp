// scripts/preinstall.js
const fs = require('fs-extra');
const path = require('path');

const src = 'C:/Programming/apps/cryo/src/bin/main.exe';
const dest = path.join(__dirname, '../node_modules/.bin/cryo-compiler');

fs.copy(src, dest, err => {
    if (err) {
        console.error('Error copying the compiler:', err);
    } else {
        console.log('Compiler copied successfully.');
    }
});
