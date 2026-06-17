const express = require('express');
const app = express();

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'UNISWAP Backend funcionando!' });
});

app.get('/', (req, res) => {
  res.json({ status: 'OK', message: 'UNISWAP Backend funcionando!' });
});

module.exports = app;