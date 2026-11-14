const { XMLParser } = require('fast-xml-parser');
const xml = '<w:p><w:bookmarkStart w:id="0" w:name="sec_abcd"/></w:p>';
const parser = new XMLParser({ ignoreAttributes: false, preserveOrder: true, attributeNamePrefix: '@_' });
const parsed = parser.parse(xml);

const findSecBookmarkNames = (node) => {
    const names = [];
    if (!node || typeof node !== 'object') return names;

    if (Array.isArray(node)) {
        for (const item of node) {
            names.push(...findSecBookmarkNames(item));
        }
        return names;
    }

    if ('w:bookmarkStart' in node) {
        const attrObj = node[':@'] || {};
        const name = attrObj['@_w:name'] || '';
        if (typeof name === 'string' && name.startsWith('sec_')) {
            names.push(name.replace('sec_', ''));
        }
    }

    for (const key of Object.keys(node)) {
        if (key !== ':@') {
            names.push(...findSecBookmarkNames(node[key]));
        }
    }
    return names;
};

console.log(findSecBookmarkNames(parsed));
