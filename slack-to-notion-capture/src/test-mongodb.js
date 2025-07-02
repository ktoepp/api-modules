require('dotenv').config();
const mongoose = require('mongoose');

async function testMongoDB() {
  try {
    console.log('🧪 Testing MongoDB connection...');
    console.log('MongoDB URI:', process.env.MONGODB_URI);
    
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    
    console.log('✅ MongoDB connected successfully!');
    console.log('📊 Database name:', mongoose.connection.name);
    console.log('📊 Connection state:', mongoose.connection.readyState);
    
    // Test creating a document
    const TestSchema = new mongoose.Schema({
      name: String,
      createdAt: { type: Date, default: Date.now }
    });
    
    const TestModel = mongoose.model('Test', TestSchema);
    const testDoc = new TestModel({ name: 'Connection Test' });
    await testDoc.save();
    console.log('✅ Test document created:', testDoc._id);
    
    await TestModel.findByIdAndDelete(testDoc._id);
    console.log('✅ Test document deleted');
    
    await mongoose.disconnect();
    console.log('✅ MongoDB test completed successfully!');
    
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    
    if (error.message.includes('ECONNREFUSED')) {
      console.log('\n💡 MongoDB is not running. Try:');
      console.log('   docker run --name mongodb-dev -p 27017:27017 -d mongo:6.0');
      console.log('   OR');
      console.log('   brew services start mongodb-community');
    }
    
    process.exit(1);
  }
}

testMongoDB();
