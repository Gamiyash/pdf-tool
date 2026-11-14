const { XMLParser } = require('fast-xml-parser');
const xml = '<w:p><w:bookmarkStart w:id="0" w:name="sec_abcd"/></w:p>';
const parser = new XMLParser({ ignoreAttributes: false, preserveOrder: true, attributeNamePrefix: '@_' });
console.log(JSON.stringify(parser.parse(xml), null, 2));
