console.log('✅ Node.js is working');
console.log('✅ Current directory:', process.cwd());

// Test if we can load modules
try {
  require('dotenv').config();
  console.log('✅ dotenv loaded');
  
  const express = require('express');
  console.log('✅ express loaded');
  
  const mongoose = require('mongoose');
  console.log('✅ mongoose loaded');
  
  console.log('✅ All modules loaded successfully');
  console.log('📍 MongoDB URI:', process.env.MONGODB_URI ? 'Set' : 'Missing');
  
} catch (error) {
  console.error('❌ Module loading error:', error.message);
}
