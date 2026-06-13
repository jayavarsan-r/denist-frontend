// backend/src/services/pdf/index.js — single entry point mapping docType → generator.
// Lab generator is added here in sub-project 2.
const { generatePrescriptionPdf } = require('./prescription.pdf');
const { generateCaseSheetPdf } = require('./caseSheet.pdf');
const { generateStatementPdf } = require('./invoice.pdf');

const generators = {
  prescription: generatePrescriptionPdf,
  caseSheet: generateCaseSheetPdf,
  statement: generateStatementPdf,
};

module.exports = { generators, generatePrescriptionPdf, generateCaseSheetPdf, generateStatementPdf };
