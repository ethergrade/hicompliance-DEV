import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  HeadingLevel,
  BorderStyle,
  VerticalAlign,
} from 'docx';
import { saveAs } from 'file-saver';
import { IRPDocumentData } from '@/types/irp';

export const generateIRPDocument = async (data: IRPDocumentData) => {
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          // Title
          new Paragraph({
            text: 'INCIDENT RESPONSE PLAN',
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),

          // Company Info
          new Paragraph({
            children: [
              new TextRun({ text: 'Azienda: ', bold: true }),
              new TextRun(data.companyName),
            ],
            spacing: { after: 200 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Indirizzo: ', bold: true }),
              new TextRun(data.companyAddress),
            ],
            spacing: { after: 200 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Data: ', bold: true }),
              new TextRun(data.date),
            ],
            spacing: { after: 200 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Versione: ', bold: true }),
              new TextRun(data.version),
            ],
            spacing: { after: 400 },
          }),

          // Introduction
          new Paragraph({
            text: '1. Introduzione',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 },
          }),
          new Paragraph({
            text: data.sections.introduction,
            spacing: { after: 400 },
          }),

          // Severity Levels
          new Paragraph({
            text: '2. Classificazione della Gravità',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 },
          }),
          createTable(
            ['Livello', 'Descrizione', 'Tempo di Risposta'],
            data.sections.severity.map(s => [s.level, s.description, s.responseTime])
          ),

          // Roles and Responsibilities
          new Paragraph({
            text: '3. Ruoli e Responsabilità',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 },
          }),
          createTable(
            ['Ruolo', 'Responsabilità', 'Contatto'],
            data.sections.roles.map(r => [r.role, r.responsibilities, r.contact])
          ),

          // Emergency Contacts
          new Paragraph({
            text: '4. Contatti di Emergenza',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 },
          }),
          createTable(
            ['Nome', 'Ruolo', 'Categoria', 'Telefono', 'Email', 'Livello Escalation'],
            data.sections.contacts.map(c => [
              c.name,
              c.role,
              c.category,
              c.phone,
              c.email,
              c.escalationLevel?.toString() || '3',
            ])
          ),

          // Communications
          new Paragraph({
            text: '5. Piano di Comunicazione',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 },
          }),
          new Paragraph({
            text: data.sections.communications,
            spacing: { after: 400 },
          }),

          // Procedures
          new Paragraph({
            text: '6. Procedure Operative',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 },
          }),
          ...data.sections.procedures.flatMap((proc, index) => [
            new Paragraph({
              text: `${index + 1}. ${proc.title}`,
              heading: HeadingLevel.HEADING_3,
              spacing: { before: 200, after: 100 },
            }),
            new Paragraph({
              children: [
                new TextRun({ text: 'Assegnato a: ', bold: true }),
                new TextRun(proc.assignedTo),
              ],
              spacing: { after: 100 },
            }),
            ...proc.steps.map(
              (step, stepIndex) =>
                new Paragraph({
                  text: `${stepIndex + 1}. ${step}`,
                  spacing: { after: 100 },
                  indent: { left: 720 },
                })
            ),
          ]),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `IRP_${data.companyName}_${data.date.replace(/\//g, '-')}.docx`);
};

const createTable = (headers: string[], rows: string[][]): Table => {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      // Header row
      new TableRow({
        children: headers.map(
          header =>
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({ text: header, bold: true })],
                  alignment: AlignmentType.CENTER,
                }),
              ],
              shading: { fill: 'CCCCCC' },
              verticalAlign: VerticalAlign.CENTER,
            })
        ),
      }),
      // Data rows
      ...rows.map(
        row =>
          new TableRow({
            children: row.map(
              cell =>
                new TableCell({
                  children: [new Paragraph(cell)],
                  verticalAlign: VerticalAlign.CENTER,
                })
            ),
          })
      ),
    ],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1 },
      bottom: { style: BorderStyle.SINGLE, size: 1 },
      left: { style: BorderStyle.SINGLE, size: 1 },
      right: { style: BorderStyle.SINGLE, size: 1 },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1 },
      insideVertical: { style: BorderStyle.SINGLE, size: 1 },
    },
  });
};
