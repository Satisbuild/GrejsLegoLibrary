import { optionalUser } from '../layout.js';

// Ingen login – knapperne i index.html peger direkte ind i appen.
await optionalUser('home');
