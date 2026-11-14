import { XMLParser } from 'fast-xml-parser';

const xml = `
<w:document>
<w:body>
    <w:p>
        <w:bookmarkStart w:id="1" w:name="sec_abc123" />
        <w:bookmarkEnd w:id="1" />
    </w:p>
    <w:tbl>
        <w:tr>
            <w:tc><w:p><w:r><w:t>Hello </w:t></w:r><w:r><w:t>World</w:t></w:r></w:p></w:tc>
            <w:tc><w:p><w:r><w:t>Cell 2</w:t></w:r></w:p></w:tc>
        </w:tr>
        <w:tr>
            <w:tc><w:p><w:r><w:t>Row 2 Cell 1</w:t></w:r></w:p></w:tc>
            <w:tc><w:p><w:r><w:t>Row 2 Cell 2</w:t></w:r></w:p></w:tc>
        </w:tr>
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

const parserPreserve = new XMLParser({ ...XML_PARSER_OPTIONS, preserveOrder: true });
const parsedPreserve = parserPreserve.parse(xml);

const root = parsedPreserve.find((n: any) => n['w:document']);
const bodyNode = root['w:document'].find((n: any) => n['w:body']);
const children = bodyNode['w:body'];

for (const node of children) {
    if (node['w:p']) {
        // extract runs ...
        console.log('Got p');
    } else if (node['w:tbl']) {
        console.log('Got table:');

        // Extract rows
        const tableContent = node['w:tbl'];
        const rows = tableContent.filter((n: any) => n['w:tr']);

        for (const trObj of rows) {
            const tr = trObj['w:tr'];
            const cells = tr.filter((n: any) => n['w:tc']);
            const rowOutput = [];

            for (const tcObj of cells) {
                const tc = tcObj['w:tc'];
                // extract all text from all w:p inside w:tc
                const cellParas = tc.filter((n: any) => n['w:p']);
                let cellText = "";
                for (const paraObj of cellParas) {
                    const para = paraObj['w:p'];
                    // get runs
                    const runs = para.filter((n: any) => n['w:r']);
                    for (const runObj of runs) {
                        const run = runObj['w:r'];
                        const textNodes = run.filter((n: any) => n['w:t']);
                        for (const tObj of textNodes) {
                            const val = tObj['w:t'][0]?.['#text'] || '';
                            cellText += val;
                        }
                    }
                }
                rowOutput.push(cellText);
            }
            console.log('Row:', rowOutput);
        }
    }
}
