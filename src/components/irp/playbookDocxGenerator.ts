import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType } from 'docx';
import { saveAs } from 'file-saver';
import { Playbook, PlaybookChecklistItem, calculatePlaybookProgress } from '@/types/playbook';

const CHECKBOX_CHECKED = '☑';
const CHECKBOX_UNCHECKED = '☐';

const createCheckboxText = (checked: boolean): string => {
  return checked ? CHECKBOX_CHECKED : CHECKBOX_UNCHECKED;
};

const createSectionTitle = (title: string, subtitle?: string): Paragraph => {
  const children: TextRun[] = [
    new TextRun({
      text: title,
      bold: true,
      size: 28,
      color: '2563eb',
    }),
  ];

  if (subtitle) {
    children.push(
      new TextRun({
        text: ` (${subtitle})`,
        bold: false,
        size: 24,
        color: '6b7280',
      })
    );
  }

  return new Paragraph({
    children,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 400, after: 200 },
  });
};

const createChecklistItem = (item: PlaybookChecklistItem): Paragraph[] => {
  const paragraphs: Paragraph[] = [];
  
  let itemText = `${createCheckboxText(item.checked)} ${item.text}`;
  
  if (item.hasInlineInput && item.inlineInputValue) {
    itemText += ` [${item.inlineInputValue}]`;
    if (item.inlineInputLabel) {
      itemText += ` ${item.inlineInputLabel}`;
    }
  }

  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: itemText,
          size: 22,
          color: item.checked ? '16a34a' : '374151',
          strike: item.checked,
        }),
      ],
      spacing: { before: 100, after: 50 },
      indent: { left: 360 },
    })
  );

  if (item.notes) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `   📝 Note: ${item.notes}`,
            size: 20,
            italics: true,
            color: '6b7280',
          }),
        ],
        spacing: { before: 50, after: 100 },
        indent: { left: 720 },
      })
    );
  }

  return paragraphs;
};

const createOwnerTable = (owner: Playbook['owner']): Table => {
  const rows = owner.map((field) => 
    new TableRow({
      children: [
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: field.label,
                  bold: true,
                  size: 22,
                }),
              ],
            }),
          ],
          width: { size: 30, type: WidthType.PERCENTAGE },
          margins: { top: 100, bottom: 100, left: 150, right: 150 },
        }),
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: field.value || field.placeholder || '_______________',
                  size: 22,
                  color: field.value ? '374151' : '9ca3af',
                  italics: !field.value,
                }),
              ],
            }),
          ],
          width: { size: 70, type: WidthType.PERCENTAGE },
          margins: { top: 100, bottom: 100, left: 150, right: 150 },
        }),
      ],
    })
  );

  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: 'e5e7eb' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: 'e5e7eb' },
      left: { style: BorderStyle.SINGLE, size: 1, color: 'e5e7eb' },
      right: { style: BorderStyle.SINGLE, size: 1, color: 'e5e7eb' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'e5e7eb' },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'e5e7eb' },
    },
  });
};

export const generatePlaybookDocx = async (playbook: Playbook): Promise<void> => {
  const progress = calculatePlaybookProgress(playbook);
  const currentDate = new Date().toLocaleDateString('it-IT', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const children: (Paragraph | Table)[] = [];

  // Title
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `PLAYBOOK: ${playbook.title}`,
          bold: true,
          size: 36,
          color: '1e3a5f',
        }),
      ],
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 200 },
    })
  );

  // Metadata
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Categoria: ${playbook.category} | Severity: ${playbook.severity} | Durata: ${playbook.duration}`,
          size: 22,
          color: '6b7280',
        }),
      ],
      spacing: { after: 100 },
    })
  );

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Generato il: ${currentDate} | Completamento: ${progress.percentage}% (${progress.completed}/${progress.total})`,
          size: 20,
          color: '9ca3af',
        }),
      ],
      spacing: { after: 400 },
    })
  );

  // Separator
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: '─'.repeat(80),
          color: 'e5e7eb',
        }),
      ],
      spacing: { after: 300 },
    })
  );

  // Purpose
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'SCOPO',
          bold: true,
          size: 28,
          color: '2563eb',
        }),
      ],
      heading: HeadingLevel.HEADING_2,
      spacing: { after: 150 },
    })
  );

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: playbook.purpose,
          size: 22,
        }),
      ],
      spacing: { after: 300 },
    })
  );

  // Owner Section
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'OWNER E SQUAD',
          bold: true,
          size: 28,
          color: '2563eb',
        }),
      ],
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300, after: 200 },
    })
  );

  children.push(createOwnerTable(playbook.owner));

  // Sections
  for (const section of playbook.sections) {
    children.push(createSectionTitle(section.title, section.subtitle));

    if (section.type === 'text' && section.content) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: section.content,
              size: 22,
            }),
          ],
          spacing: { after: 200 },
        })
      );
    }

    if (section.type === 'checklist' && section.items) {
      for (const item of section.items) {
        children.push(...createChecklistItem(item));
      }
    }
  }

  // Footer
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: '─'.repeat(80),
          color: 'e5e7eb',
        }),
      ],
      spacing: { before: 400, after: 200 },
    })
  );

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'Documento generato automaticamente da HiCompliance',
          size: 18,
          color: '9ca3af',
          italics: true,
        }),
      ],
      alignment: AlignmentType.CENTER,
    })
  );

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const filename = `${playbook.id}_checklist_${new Date().toISOString().split('T')[0]}.docx`;
  saveAs(blob, filename);
};
