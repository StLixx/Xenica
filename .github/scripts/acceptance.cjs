function parse(comment,{owner,source,product}) {
  if(comment?.user?.login!==owner)return null;
  const [command,...rest]=comment.body?.trim().split('\n') ?? [];
  if(command!==`/验收 ${source} ${product}` && command!==`/通过 ${source} ${product}`)return null;
  try {
    const evidence=JSON.parse(rest.join('\n'));
    if(evidence.type!=='product-acceptance'||typeof evidence.quote!=='string'||!evidence.quote.trim()||
      /^(开始|start|begin)[！!。 .]*$/i.test(evidence.quote.trim())||typeof evidence.origin!=='string'||!evidence.origin.trim()||
      !evidence.experiencedAt||!Number.isFinite(Date.parse(evidence.experiencedAt)))return null;
    return {quote:evidence.quote,origin:evidence.origin,experiencedAt:evidence.experiencedAt,comment:comment.id};
  }catch{return null;}
}
module.exports={parse};
