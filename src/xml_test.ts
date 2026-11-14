import { XMLParser } from 'fast-xml-parser';

const xml = `
<w:document>
  <w:body>
    <w:p>
      <w:r><w:t>Para 1</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Para 2</w:t></w:r>
    </w:p>
    <w:tbl>
      <w:tr><w:tc><w:p><w:r><w:t>Table Para 1</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
    <w:p>
      <w:r><w:t>Para 3</w:t></w:r>
    </w:p>
  </w:body>
</w:document>
`;

const XML_PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: false,
  isArray: (name: string) =>
    ['w:p', 'w:r', 'w:bookmarkStart', 'w:tr', 'w:tc', 'w:t'].includes(name),
};

const parser = new XMLParser(XML_PARSER_OPTIONS);
const parsed = parser.parse(xml);
const body = parsed?.['w:document']?.['w:body'] ?? {};
const paragraphs: any[] = Array.isArray(body['w:p']) ? body['w:p'] : (body['w:p'] ? [body['w:p']] : []);
console.log('Standard parser paragraphs length:', paragraphs.length);
console.log('Total text of standard paragraphs:', paragraphs.map(p => JSON.stringify(p)).join('\\n'));

const parserPreserve = new XMLParser({ ...XML_PARSER_OPTIONS, preserveOrder: true });
const parsedPreserve = parserPreserve.parse(xml);
const root = parsedPreserve.find((n: any) => n['w:document']);
const bodyNode = root?.['w:document']?.find((n: any) => n['w:body']);
const children = bodyNode?.['w:body'] ?? [];

const preserveP = children.filter((n: any) => 'w:p' in n);

console.log('Standard parser paragraphs length:', paragraphs.length);
console.log('Preserve parser paragraphs length:', preserveP.length);
console.log('Match?', paragraphs.length === preserveP.length);

for (let i = 0; i < paragraphs.length; i++) {
  console.log(`P${i} standard:`, JSON.stringify(paragraphs[i]));
  console.log(`P${i} preserve:`, JSON.stringify(preserveP[i]['w:p']));
}
