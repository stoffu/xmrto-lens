var btc_regex = /\b[13][a-km-zA-HJ-NP-Z0-9]{26,33}\b/g;

function inject_lens_icon(node) {
    var next;
    if (node.nodeType === 1) {
        // (Element node)
        if (node = node.firstChild) {
            do {
                // Recursively call inject_lens_icon
                // on each child node
                next = node.nextSibling;
                inject_lens_icon(node);
            } while(node = next);
        }
    } else if (node.nodeType === 3) {
        // (Text node)
        if (btc_regex.test(node.data)) {
            //console.log('found node with BTC addresses', node.parentNode.id);
            wrapMatchesInNode(node);
            chrome.runtime.sendMessage({address_present: true});
            inject_modal();
        }
    }
}

function show_error(msg) {
    // At any point in the process, if the XMR.TO api returns any kind of error,
    // this text gets placed into the page.
    $("#xmrto-lens-modal").html(
        "<div class='ui-state-error ui-corner-all xmrto-error'>" +
            "XMR.TO API returned an Error:<br><br>" +
            "<span class='ui-state-error-text xmrto-error-text'>" + msg + "</span>" +
        "</div>"
    );
    $("#xmrto-lens-modal").dialog("option", "buttons", []);
}

function show_success(msg) {
    // when the enire transaction is complete bring up this page telling them
    // the transaction went successfully.
    $("#xmrto-lens-modal").html(
        "<div class='ui-state-highlight ui-corner-all xmrto-success'>" +
            "Success!<br><br>" +
            "<span class='xmrto-success-text'>" + msg + "</span><br><br> " +
            "<br><a href='#' class='xmrto-finish'>Finish</a>" +
        "</div>"
    );
    $("#xmrto-lens-modal").dialog("option", "buttons", []);
}

function show_status(msg) {
    $("#xmrto-lens-modal .xmrto-status").html(msg);
}

var spinner = '<div class="spinner"><div class="bounce1"></div><div class="bounce2"></div><div class="bounce3"></div></div>';
var interval_id;
var already_injected = false;

function inject_modal() {
    if(already_injected) {
        return;
    }
    $('body').append(
    "<div id='xmrto-lens-modal'>" +
        "<div class='xmrto-panel-header'>" +
            "<div class='pull-left'>Min: <span class='xmrto-min-limit text-white'></span> Max: <span class='xmrto-max-limit text-white'></span></div>" +
            "<div class='pull-right'>Rate: <span class='xmrto-rate text-white'></span></div>" +
        "</div>"+
        "<div class='xmrto-panel-body'>" +
            "<div>" +
                "<span class='text-white'>Destination:</span>" +
                "<input class='xmrto-address xmrto-form-control' disabled></input>" +
            "</div>" +
            "<div class='vspace-20'></div>" +
            "<div>" +
                "<span class='text-white'>Amount in Bitcoin:</span>" +
                "<input class='xmrto-amount xmrto-form-control' type=number></input>" +
                "<button class='xmrto-pay-button width-30 pull-right'>Pay</button>" +
            "</div>" +
        "</div>" +
    "</div>"
    );

    $("#xmrto-lens-modal .xmrto-pay-button").click(function(event) {
        var btc_amount = $("#xmrto-lens-modal .xmrto-amount").val()
        if (!btc_amount) {
            return;
        }

        var btc_dest_address = $("#xmrto-lens-modal .xmrto-address").val();

        var order_create_param = {
            btc_amount: btc_amount,
            btc_dest_address: btc_dest_address
        };
        $("#xmrto-lens-modal").html("<span class='hspace-10'></span>Calling XMR.TO's API... " + spinner);
        $.post("https://xmr.to/api/v1/xmr2btc/order_create/", order_create_param).done(function(order_create_res) {
            if(order_create_res.error) {
                show_error(order_create_res.error_msg);
                return;
            }
            var ticks = 0;
            var seconds_remaining = null;
            interval_id = setInterval(function() {
                if(ticks % 8 == 0) {
                    $.post("https://xmr.to/api/v1/xmr2btc/order_status_query/", { uuid: order_create_res.uuid } ).done(function(order_status_query_res) {
                        if (order_status_query_res.error) {
                            show_error(order_status_query_res.error_msg);
                            clearInterval(interval_id);
                            return;
                        }

                        var state                           = order_status_query_res.state;
                        var btc_num_confirmations           = order_status_query_res.btc_num_confirmations;
                        var btc_transaction_id              = order_status_query_res.btc_transaction_id;
                        var seconds_till_timeout            = order_status_query_res.seconds_till_timeout;
                        var xmr_amount_total                = order_status_query_res.xmr_amount_total;
                        var xmr_amount_remaining            = order_status_query_res.xmr_amount_remaining;
                        var xmr_num_confirmations_remaining = order_status_query_res.xmr_num_confirmations_remaining;
                        var xmr_receiving_address           = order_status_query_res.xmr_receiving_address;
                        var xmr_required_amount             = order_status_query_res.xmr_required_amount;
                        var xmr_required_payment_id         = order_status_query_res.xmr_required_payment_id;

                        seconds_remaining = state == "UNPAID" || state == "UNDERPAID" ? seconds_till_timeout : null;

                        var final_modal =
                            "<div class='xmrto-panel-body'>" +
                                "<div>Send <span class='xmrto-remaining-amount text-white'></span> to:<div>" +
                                "<div class='text-white text-xsmall'>" + xmr_receiving_address + "</div>" + 
                                "<div>with Payment ID <span class='text-white'>" + xmr_required_payment_id + "</span><div>" +
                                "<div class='text-small text-bold text-orange'>Don't forget to attach the Payment ID!</div>" +
                                "<div class='vspace-20'></div>" +
                                "<div>The fund will be converted to <span class='text-white'>" + btc_amount + "</span> BTC and sent to </div>" +
                                "<div class='text-white'>" + btc_dest_address + "</div>" +
                                "<div class='vspace-10'></div>" +
                                "<div>Order secret key:</div>" +
                                "<div class='text-white'>" + order_create_res.uuid + "</div>" +
                                "<div class='vspace-10'></div>" +
                                "<div>CLI command:</div>" +
                                "<div class='text-xxsmall'><textarea class='width-100' style='height:40px'>transfer 4 " + xmr_receiving_address + " " + xmr_amount_remaining + " " + xmr_required_payment_id + "</textarea></div>" +
                                "<div class='vspace-10'></div>" +
                                "<div>QR code:</div>" +
                                "<div id='xmrto-qrcode'></div>" +
                            "</div>" +
                            "<div class='xmrto-status-outer'>" +
                                "<div class='xmrto-status pull-left'></div>" +
                                "<div class='xmrto-timer pull-right'></div>" +
                            "</div>";
                        $("#xmrto-lens-modal").html(final_modal);

                        var qrstring =
                            "monero:" + xmr_receiving_address +
                            "?tx_payment_id=" + xmr_required_payment_id +
                            "&tx_amount=" + xmr_amount_remaining +
                            "&recipient_name=XMR.TO";
                        new QRCode(document.getElementById("xmrto-qrcode"), qrstring);

                        if (state == "UNDERPAID") {
                            $("#xmrto-lens-modal .xmrto-remaining-amount").text("remaining " + xmr_amount_remaining + " XMR (totaling " + xmr_amount_total + " XMR)");

                        } else {
                            $("#xmrto-lens-modal .xmrto-remaining-amount").text(xmr_amount_remaining + " XMR");
                        }

                        switch (state) {
                            case "TO_BE_CREATED":
                                show_status("Status: order creation pending. " + spinner);
                                break;
                            case "UNPAID":
                                show_status("Status: Awaiting Your " + "Monero" + " " + spinner);
                                break;
                            case "UNDERPAID":
                                show_status("Status: Awaiting Your " + "Monero" + " (underpaid) " + spinner);
                                break;
                            case "PAID_UNCONFIRMED":
                                show_status("Status: Payment Received, waiting for confirmation. " + spinner);
                                break;
                            case "PAID":
                                show_status("Status: Payment received and confirmed, now sending BTC. " + spinner);
                                break;
                            case "BTC_SENT":
                                show_success("<div class='xmrto-in-out'>" + xmr_required_amount + " XMR was converted to " + btc_amount + " BTC and sent to " + "<strong>" + btc_dest_address + "</strong></div>");
                                clearInterval(interval_id);
                                return;
                            case "TIMED_OUT":
                                show_error("order timed out before payment was complete");
                                clearInterval(interval_id);
                                return;
                            case "NOT_FOUND":
                                show_error("order wasn’t found in system (never existed or was purged)");
                                clearInterval(interval_id);
                                return;
                        }
                    });
                }

                if (seconds_remaining )//|| expiration)
                {
                    seconds_remaining--;
                    //var seconds = seconds_remaining ? seconds_remaining : ((expiration - new Date()) / 1000).toFixed(0);
                    var seconds = seconds_remaining;
                    var timeText = ""
                    var sec = 0;
                    if(seconds > 59)
                    {
                        var min = Math.floor(seconds / 60);
                        sec = seconds - (min * 60);

                        if(sec < 10)
                        {
                            sec = "0"+sec;
                        }

                        timeText = min+":"+sec;
                    }
                    else
                    {
                        if(seconds < 10)
                        {
                            sec = "0"+seconds;
                        }

                        timeText ="0:"+sec;
                    }
                    
                    if(seconds > 0) {
                        $("#xmrto-lens-modal .xmrto-timer").text(timeText + " until expiration");
                    } else {
                        show_error("Time Expired! Please try again.");
                        clearInterval(interval_id);
                        return;
                    }
                } else {
                    $("#xmrto-lens-modal .xmrto-timer").text('');
                }

                ticks++;
            }, 1000);
        });
    });

            $('.xmrto-limit, .xmrto-rate').fadeIn();
            var altcoin_symbol = "xmr"
            var pair = "btc_" + altcoin_symbol;
    
            $("#xmrto-lens-modal .xmrto-min-limit").html(spinner);
            $("#xmrto-lens-modal .xmrto-max-limit").html(spinner);
            $("#xmrto-lens-modal .xmrto-rate").html(spinner);
            
            $('#xmrto-lens-modal .xmrto-more-options').show();
    
            $.get("https://xmr.to/api/v1/xmr2btc/order_parameter_query/", function(response) {
                if(response.error) {
                    show_error("XMR.TO API returned an error: " + response.error_msg);
                    return;
                }
                $("#xmrto-lens-modal .xmrto-rate").text("1 XMR = " + response.price + " BTC");
    
                    var lower_limit = response.lower_limit;
                    var upper_limit = response.upper_limit;
    
                    $("#xmrto-lens-modal .xmrto-min-limit").text(response.lower_limit + " BTC");
                    $("#xmrto-lens-modal .xmrto-max-limit").text(response.upper_limit + " BTC");
    
            }).error(function(response) {
                show_error("General Ajax failure");
            });

    already_injected = true; // only inject once
}

icon_url = chrome.extension.getURL("lens_icon_12.png");

function wrapMatchesInNode(textNode) {

    var temp = document.createElement('div');

    temp.innerHTML = textNode.data.replace(btc_regex, '$&<a class="xmrto-lens-link" href="#" data-address="$&"><img title="Click to send altcoins to this BTC address" src="' + icon_url + '"></a> ');

    // temp.innerHTML is now:
    // "\n    This order's reference number is <a href="/order/RF83297">RF83297</a>.\n"
    // |_______________________________________|__________________________________|___|
    //                     |                                      |                 |
    //                 TEXT NODE                             ELEMENT NODE       TEXT NODE

    // Extract produced nodes and insert them
    // before original textNode:
    while (temp.firstChild) {
        textNode.parentNode.insertBefore(temp.firstChild, textNode);
    }

    // Remove original text-node:
    textNode.parentNode.removeChild(textNode);
}

inject_lens_icon(document.body);
//document.body.addEventListener("DOMNodeInserted", function(event) { inject_lens_icon(event.target); }, false);
//document.body.addEventListener("DOMCharacterDataModified", function(event) { inject_lens_icon(event.target); }, false);

$(function() {
    
    $("body").on("click", '.xmrto-lens-link', function(event) {
        // When the user clicks on one of the fox icons embedded on the page,
        // this function gets called which launches the modal.
        event.preventDefault();
        var address = $(this).data('address');
        //chrome.runtime.sendMessage({clicked_address: address});







        $("#xmrto-lens-modal .xmrto-address").val(address);
        $("#xmrto-lens-modal").dialog({
            show: { effect: "fade", duration: 300 },
            dialogClass: 'xmrto-dialog',
            width: "600px",
            title: "XMR.TO Lens",
            close: function(event) {
                $("#xmrto-lens-modal").remove();
                already_injected = false;
                inject_modal();
                clearInterval(interval_id);
            },
        });

        $("body").on("click", ".xmrto-finish", function (event) {
            event.preventDefault();
            $("#xmrto-lens-modal").dialog("close");
        });
        //show_success("induced success");
        $('input[data-toggle="popover"]').focus(function(){

        });
        $('input[data-toggle="popover"]').on('blur', function(){
           $('.xmrto-popover').fadeOut().remove();
        }).on('focus', function(){
              var width = $(this).width() + 10;
            var content = $(this).attr('data-content');
            $('<div role="tooltip" class="xmrto-popover right" id="popover83172" style="display: none; left:' + width + 'px;"><div class="arrow"></div><div class="popover-content">' + content + '</div></div>').insertAfter(this).fadeIn();
            var popHeight = $('.xmrto-popover').height() + 5;
            $('.xmrto-popover').css({top: '50%', 'margin-top': -popHeight / 2});
        });
    });

});
