import { Boom } from '@hapi/boom';
import { proto } from '../../WAProto/index.js';
import {} from './types.js';
// some extra useful utilities
const indexCache = new WeakMap();
export const getBinaryNodeChildren = (node, childTag) => {
    if (!node || !Array.isArray(node.content))
        return [];
    let index = indexCache.get(node);
    // Build the index once per node
    if (!index) {
        index = new Map();
        for (const child of node.content) {
            let arr = index.get(child.tag);
            if (!arr)
                index.set(child.tag, (arr = []));
            arr.push(child);
        }
        indexCache.set(node, index);
    }
    // Return first matching child
    return index.get(childTag) || [];
};
export const getBinaryNodeChild = (node, childTag) => {
    return getBinaryNodeChildren(node, childTag)[0];
};
export const getAllBinaryNodeChildren = ({ content }) => {
    if (Array.isArray(content)) {
        return content;
    }
    return [];
};
export const getBinaryNodeChildBuffer = (node, childTag) => {
    const child = getBinaryNodeChild(node, childTag)?.content;
    if (Buffer.isBuffer(child) || child instanceof Uint8Array) {
        return child;
    }
};
export const getBinaryNodeChildString = (node, childTag) => {
    const child = getBinaryNodeChild(node, childTag)?.content;
    if (Buffer.isBuffer(child) || child instanceof Uint8Array) {
        return Buffer.from(child).toString('utf-8');
    }
    else if (typeof child === 'string') {
        return child;
    }
};
export const getBinaryNodeChildUInt = (node, childTag, length) => {
    const buff = getBinaryNodeChildBuffer(node, childTag);
    if (buff) {
        return bufferToUInt(buff, length);
    }
};
export const assertNodeErrorFree = (node) => {
    const errNode = getBinaryNodeChild(node, 'error');
    if (errNode) {
        throw new Boom(errNode.attrs.text || 'Unknown error', { data: +errNode.attrs.code });
    }
};
export const reduceBinaryNodeToDictionary = (node, tag) => {
    const nodes = getBinaryNodeChildren(node, tag);
    const dict = nodes.reduce((dict, { attrs }) => {
        if (typeof attrs.name === 'string') {
            dict[attrs.name] = attrs.value || attrs.config_value;
        }
        else {
            dict[attrs.config_code] = attrs.value || attrs.config_value;
        }
        return dict;
    }, {});
    return dict;
};
export const getBinaryNodeMessages = ({ content }) => {
    const msgs = [];
    if (Array.isArray(content)) {
        for (const item of content) {
            if (item.tag === 'message') {
                msgs.push(proto.WebMessageInfo.decode(item.content).toJSON());
            }
        }
    }
    return msgs;
};
function bufferToUInt(e, t) {
    let a = 0;
    for (let i = 0; i < t; i++) {
        a = 256 * a + e[i];
    }
    return a;
}
const tabs = (n) => '\t'.repeat(n);
export function binaryNodeToString(node, i = 0) {
    if (!node) {
        return node;
    }
    if (typeof node === 'string') {
        return tabs(i) + node;
    }
    if (node instanceof Uint8Array) {
        return tabs(i) + Buffer.from(node).toString('hex');
    }
    if (Array.isArray(node)) {
        return node.map(x => tabs(i + 1) + binaryNodeToString(x, i + 1)).join('\n');
    }
    const children = binaryNodeToString(node.content, i + 1);
    const tag = `<${node.tag} ${Object.entries(node.attrs || {})
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}='${v}'`)
        .join(' ')}`;
    const content = children ? `>\n${children}\n${tabs(i)}</${node.tag}>` : '/>';
    return tag + content;
}
/**
 * Lia@Changes 30-01-26
 * ---
 * Produce the binary node (WABinary-like JSON shape) required for the specific
 * interactive button / list type.
 * compatible with observed official client traffic.
 *
 * NOTE: Returning different "v" (version) and "name" values influences how
 * WhatsApp renders & validates flows. The constants here are empirically derived.
 *
 * @param {object} message Normalized message content (after Baileys normalization).
 * @returns {object} A node with shape { tag, attrs, [content] } to inject into additionalNodes.
 */
const bizFlowMap = {
    mpm: 1,
    cta_catalog: 1,
    send_location: 1,
    call_permission_request: 1,
    wa_payment_transaction_details: 1,
    automated_greeting_message_view_catalog: 1
};
const bizBinaryQualityAttribute = {
    tag: 'quality_control',
    attrs: { source_type: 'third_party' },
    content: undefined
};
const baseBizAttrs = {};
const defaultContent = [bizBinaryQualityAttribute];
const listContent = [{
    tag: 'list',
    attrs: { v: '2', type: 'product_list' },
    content: undefined
}, bizBinaryQualityAttribute];
const makeInteractive = (v, name) => {
    return [{
        tag: 'interactive',
        attrs: { type: 'native_flow', v: '1' },
        content: [{
            tag: 'native_flow',
            attrs: { v, name },
            content: undefined
        }]
    }, bizBinaryQualityAttribute];
}
export const getBizBinaryNode = (message) => {
    const nativeFlowMessage = message.interactiveMessage?.nativeFlowMessage;
    const buttonName = nativeFlowMessage?.buttons?.[0]?.name;
    if (buttonName === 'review_and_pay' || buttonName === 'payment_info') {
        return {
            tag: 'biz',
            attrs: {
                native_flow_name: buttonName === 'review_and_pay'
                    ? 'order_details'
                    : buttonName
            },
            content: defaultContent
        };
    }
    if (buttonName && bizFlowMap[buttonName]) {
        return {
            tag: 'biz',
            attrs: baseBizAttrs,
            content: makeInteractive('2', buttonName)
        };
    }
    if (nativeFlowMessage || message.buttonsMessage || message.templateMessage) {
        return {
            tag: 'biz',
            attrs: baseBizAttrs,
            content: makeInteractive('9', 'mixed')
        };
    }
    if (message.listMessage) {
        return {
            tag: 'biz',
            attrs: baseBizAttrs,
            content: listContent
        };
    }
    return {
        tag: 'biz',
        attrs: baseBizAttrs,
        content: defaultContent
    };
}