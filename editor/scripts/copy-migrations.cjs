// build:backend 后置步骤——把 personal SQLite 迁移 SQL 复制进 bundle，
// 安装包（asar）里 migrate() 才能读到它们（P9.1）。
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const src = path.join(root, 'backend-server', 'src', 'personal', 'migrations');
const dst = path.join(root, 'backend-server', 'bundle', 'migrations');
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true });
console.log('migrations copied:', fs.readdirSync(dst).join(', '));
