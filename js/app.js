let creds = { server: '', user: '', pass: '' };
let currentTab = 'live'; 
let currentItems = [];
let seriesCachedData = {};

window.addEventListener('DOMContentLoaded', checkPersistentSession);
