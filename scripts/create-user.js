// יצירת משתמש: npm run create-user -- <username> <password> <owner|manager|collector> [שם תצוגה] [שם גובה]
import { createUser } from '../server/auth.js';
const [username, password, role = 'owner', name, collector_name] = process.argv.slice(2);
console.log(createUser({ username, password, role, name: name || username, collector_name }));
