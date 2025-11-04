import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { saveAs } from 'file-saver';
import { IRPDocumentData } from '@/types/irp';

const mapCategoryToIRPRole = (category: string): string => {
  const mapping: Record<string, string> = {
    'security': 'Incident Response Team',
    'it': 'Incident Response Manager',
    'management': 'Steering Committee',
    'legal': 'Legal Counsel',
    'communications': 'Communications Lead',
    'insurance': 'Cyber Insurance',
    'authorities': 'External Authority',
    'technical': 'Technical Support',
    'executive': 'Executive Team',
  };
  return mapping[category.toLowerCase()] || 'Incident Response Team';
};

export const generateIRPDocument = async (data: IRPDocumentData) => {
  try {
    // 1. Load the template from public folder
    const templatePath = '/irp/IRP_template.docx';
    const response = await fetch(templatePath);
    
    if (!response.ok) {
      throw new Error('Template file not found');
    }
    
    const templateBuffer = await response.arrayBuffer();
    
    // 2. Load the template with PizZip
    const zip = new PizZip(templateBuffer);
    
    // 3. Create Docxtemplater instance
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: {
        start: '[',
        end: ']'
      }
    });
    
    // 4. Prepare data for template
    const templateData = {
      'NOME AZIENDA': data.companyName,
      'DATA ELABORAZIONE': data.date,
      companyAddress: data.companyAddress,
      version: data.version,
      contacts: data.sections.contacts.map(contact => ({
        nome: contact.name,
        titolo: contact.role,
        ruolo: mapCategoryToIRPRole(contact.category),
        contatto: `${contact.phone} - ${contact.email}`,
        escalationLevel: contact.escalationLevel?.toString() || '3',
      })),
    };
    
    // 5. Render the document with data
    doc.render(templateData);
    
    // 6. Generate the output
    const output = doc.getZip().generate({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    
    // 7. Download the file
    const fileName = `IRP_${data.companyName.replace(/\s+/g, '_')}_${data.date.replace(/\//g, '-')}.docx`;
    saveAs(output, fileName);
    
  } catch (error) {
    console.error('Error generating IRP document:', error);
    throw new Error('Failed to generate IRP document. Please check the template file.');
  }
};
