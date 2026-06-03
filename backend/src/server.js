require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const app = express();

app.use(helmet());
app.use(cors({ origin: '*' }));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/patients', require('./routes/patients.routes'));
app.use('/api/visits', require('./routes/visits.routes'));
app.use('/api/appointments', require('./routes/appointments.routes'));
app.use('/api/ai', require('./routes/ai.routes'));
app.use('/api/analytics', require('./routes/analytics.routes'));
app.use('/api/treatment-plans', require('./routes/treatment-plans.routes'));
app.use('/api/visits/:visitId/notes', require('./routes/visit-notes.routes'));
app.use('/api/prescriptions', require('./routes/prescriptions.routes'));
app.use('/api/xrays', require('./routes/xrays.routes'));
app.use('/api/dataset', require('./routes/dataset.routes'));
app.use('/api/queue', require('./routes/queue.routes'));
app.use('/api/staff', require('./routes/staff.routes'));
app.use('/api/clinic', require('./routes/clinic.routes'));
app.use('/api/payments', require('./routes/payments.routes'));

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
app.use(require('./middleware/errorHandler'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`DentAI Backend running on port ${PORT}`);
  const { runAudioCleanup } = require('./jobs/cleanup.job');
  setTimeout(() => runAudioCleanup(18).catch(console.error), 30000);
  setInterval(() => runAudioCleanup(18).catch(console.error), 24 * 60 * 60 * 1000);
});
