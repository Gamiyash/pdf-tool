import { XMLParser } from 'fast-xml-parser';

const xml = `
<w:document>
<w:body>
    <w:p><w:r><w:t>First P</w:t></w:r></w:p>
    <w:tbl>
        <w:tr><w:tc><w:p><w:r><w:t>Tbl 1</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
    <w:p><w:r><w:t>Second P</w:t></w:r></w:p>
    <w:tbl>
        <w:tr><w:tc><w:p><w:r><w:t>Tbl 2</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
</w:body>
</w:document>
`;

const XML_PARSER_OPTIONS = {
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name: string) =>
        ['w:p', 'w:r', 'w:bookmarkStart', 'w:tr', 'w:tc', 'w:t'].includes(name),
};

const parserNormal = new XMLParser(XML_PARSER_OPTIONS);
const normal = parserNormal.parse(xml);
const bodyNormal = normal['w:document']['w:body'];
const paragraphs = bodyNormal['w:p'];
const tables = bodyNormal['w:tbl'];
console.log('Normal paras:', paragraphs.length);
console.log('Normal tables:', tables.length);

const parserPreserve = new XMLParser({ ...XML_PARSER_OPTIONS, preserveOrder: true });
const parsedPreserve = parserPreserve.parse(xml);
const root = parsedPreserve.find((n: any) => n['w:document']);
const bodyNode = root['w:document'].find((n: any) => n['w:body']);
const children = bodyNode['w:body'];

let pIndex = 0;
let tIndex = 0;

for (const node of children) {
    const key = Object.keys(node)[0];
    if (key === 'w:p') {
        console.log('Match P:', JSON.stringify(paragraphs[pIndex++]));
    } else if (key === 'w:tbl') {
        console.log('Match Tbl:', JSON.stringify(tables[tIndex++]));
    }
}
