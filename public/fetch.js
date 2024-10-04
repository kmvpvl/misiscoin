const user = Telegram.WebApp.initDataUnsafe.user;
const querycheckstring = Telegram.WebApp.initData;

/**
 * 
 * @param {string} command 
 * @param {object} requestData 
 * @param {(res: any)=>void} successcb 
 * @param {(err: any)=>void} errorcb 
 */
function fetchCommand(command, requestData, successcb, errorcb) {
    $.ajaxSetup({
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'misiscoin-tgquerycheckstring': querycheckstring,
            'misiscoin-tguid': user.id
        }
    });
    $.post(command, JSON.stringify(requestData), (data, status, xhdr)=>{
        if ('success' == status) {
            successcb(data);
        } else {
            errorcb(xhdr);
        }
    })
    .fail((xhr, status, errorObj)=>{
        errorcb(xhr);
    });
}