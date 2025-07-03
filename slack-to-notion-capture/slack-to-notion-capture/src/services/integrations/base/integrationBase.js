class IntegrationBase {
  constructor(name, config) {
    this.name = name;
    this.config = config;
    this.initialized = false;
  }
  
  async initialize() {
    this.initialized = true;
  }
}

module.exports = IntegrationBase;
