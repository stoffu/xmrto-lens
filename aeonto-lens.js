var btc_regex = /\b[123mn][a-km-zA-HJ-NP-Z0-9]{26,35}\b/g;

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
    // At any point in the process, if the AEON.to api returns any kind of error,
    // this text gets placed into the page.
    $("#aeonto-lens-modal").html(
        "<div class='ui-state-error ui-corner-all aeonto-error'>" +
            "AEON.to API returned an Error:<br><br>" +
            "<span class='ui-state-error-text aeonto-error-text'>" + msg + "</span>" +
        "</div>"
    );
}

function show_success(msg) {
    // when the enire transaction is complete bring up this page telling them
    // the transaction went successfully.
    $("#aeonto-lens-modal").html(
        "<div class='aeonto-success'>" +
            "<div class='text-green text-bold text-xlarge'>" + chrome.i18n.getMessage("success_header") + "</div>" +
            "<div class='vspace-10'></div>" +
            msg +
        "</div>"
    );
}

function show_status(msg, uuid) {
    $("#aeonto-lens-modal .aeonto-status").html(
        "<div class='pull-left'>" + chrome.i18n.getMessage("status") + ": <span class='text-white'>" + msg + "</span></div>" +
        (uuid === undefined ? "" :
        "<div class='pull-left'>" + chrome.i18n.getMessage("orderkey") + ": <span class='text-white'>" + uuid + "</span></div>")
    );
}

var spinner = '<div class="aeonto-spinner"><div class="bounce1"></div><div class="bounce2"></div><div class="bounce3"></div></div>';
var interval_id;
var already_injected = false;
var btc_amount;
var lower_limit;
var upper_limit;

function inject_modal() {
    if(already_injected) {
        return;
    }

    $('body').append(
    "<div id='aeonto-lens-modal'>" +
        "<div class='aeonto-panel-header'>" +
            "<div class='pull-left'>" + chrome.i18n.getMessage("min") + ": <span class='aeonto-min-limit text-white'></span> " + chrome.i18n.getMessage("max") + ": <span class='aeonto-max-limit text-white'></span></div>" +
            "<div class='pull-right'>" + chrome.i18n.getMessage("rate") + ": <span class='aeonto-rate text-white'></span></div>" +
        "</div>"+
        "<div class='aeonto-panel-body'>" +
            "<div class='stagenet-label'>stagenet</div>" +
            "<div>" +
                "<span class='text-white'>" + chrome.i18n.getMessage("destination") + ":</span>" +
                "<input class='aeonto-address aeonto-form-control' disabled></input>" +
            "</div>" +
            "<div class='vspace-20'></div>" +
            "<div>" +
                "<span class='text-white'>" + chrome.i18n.getMessage("amount_in_bitcoin") + ":</span>" +
                "<input class='aeonto-amount aeonto-form-control' type=number></input>" +
                "<button class='aeonto-pay-button width-30 pull-right' disabled>" + chrome.i18n.getMessage("pay") + "</button>" +
            "</div>" +
            "<div class='aeonto-estimation-time'>" + chrome.i18n.getMessage("estimation_pre") + " <span class='aeonto-estimation-amount'></span> " + chrome.i18n.getMessage("estimation_post") + " </div>" +
        "</div>" +
    "</div>"
    );

    $("#aeonto-lens-modal .aeonto-amount").on("input", function() {
        btc_amount = $("#aeonto-lens-modal .aeonto-amount").val()
        $("#aeonto-lens-modal .aeonto-pay-button").prop("disabled", btc_amount < lower_limit || upper_limit < btc_amount);
    });

    $("#aeonto-lens-modal .aeonto-pay-button").click(function(event) {

        var btc_dest_address = $("#aeonto-lens-modal .aeonto-address").val();

        var order_create_param = {
            btc_amount: btc_amount,
            btc_dest_address: btc_dest_address
        };
        $("#aeonto-lens-modal").html("<span class='hspace-10'></span>" + chrome.i18n.getMessage("calling_api") + spinner);
        $.post(endpoint + "/aeon2btc/order_create/", order_create_param).done(function(order_create_res) {
            if(order_create_res.error) {
                show_error(order_create_res.error_msg);
                return;
            }
            var ticks = 0;
            var state;
            var seconds_till_timeout;
            interval_id = setInterval(function() {
                if (seconds_till_timeout) {
                    seconds_till_timeout--;
                }
                // cehck the satus every 5 seconds
                if(ticks % 5 == 0) {
                    $.post(endpoint + "/aeon2btc/order_status_query/", { uuid: order_create_res.uuid } ).done(function(order_status_query_res) {
                        if (order_status_query_res.error) {
                            show_error(order_status_query_res.error_msg);
                            clearInterval(interval_id);
                            return;
                        }

                        var btc_num_confirmations        = order_status_query_res.btc_num_confirmations;
                        var btc_transaction_id           = order_status_query_res.btc_transaction_id;
                        var incoming_amount_total        = order_status_query_res.incoming_amount_total;
                        var remaining_amount_incoming    = order_status_query_res.remaining_amount_incoming;
                        var receiving_integrated_address = order_status_query_res.receiving_integrated_address;

                        state                = order_status_query_res.state;
                        seconds_till_timeout = order_status_query_res.seconds_till_timeout;

                        var panel_body =
                        "<div class='aeonto-panel-body'>" +
                            "<div>" + chrome.i18n.getMessage("send_pre") + " <span class='aeonto-remaining-amount text-white'></span> " + chrome.i18n.getMessage("send_post") +":<div>" +
                            "<div class='text-white' style='word-wrap: break-word'>" + receiving_integrated_address + "</div>" + 
                            // "<div>" + chrome.i18n.getMessage("paymentid") + " <span class='text-white'>" + aeon_required_payment_id + "</span><div>" +
                            // "<div class='text-small text-bold text-orange'>" + chrome.i18n.getMessage("caution") + "</div>" +
                            "<div class='vspace-20'></div>" +
                            "<div>" + chrome.i18n.getMessage("convert_pre") + " <span class='text-white'>" + btc_amount + "</span> " + chrome.i18n.getMessage("convert_post") + "</div>" +
                            "<div class='text-white'>" + btc_dest_address + "</div>" +
                            "<div class='vspace-10'></div>" +
                            "<div>" + chrome.i18n.getMessage("orderkey") + ":</div>" +
                            "<div class='text-white'>" + order_create_res.uuid + "</div>" +
                            "<div class='vspace-10'></div>" +
                            "<div>" + chrome.i18n.getMessage("commandline") + ":</div>" +
                            "<div class='text-xsmall'><textarea class='width-100' style='height:60px' onclick='this.select()'>transfer normal " + receiving_integrated_address + " " + remaining_amount_incoming + "</textarea></div>" +
                            "<div class='vspace-10'></div>" +
                            "<div>" + chrome.i18n.getMessage("qrcode") + ":</div>" +
                            "<div id='aeonto-qrcode'></div>" +
                        "</div>";

                        var status_outer =
                        "<div class='aeonto-status-outer'>" +
                            "<div class='aeonto-status pull-left'></div>" +
                            "<div class='aeonto-timer pull-right'></div>" +
                        "</div>";

                        if (state == "UNPAID" || state == "UNDERPAID") {
                            $("#aeonto-lens-modal").html(panel_body + status_outer);

                            var qrstring =
                                "aeon:" + receiving_integrated_address +
                                "?tx_amount=" + remaining_amount_incoming +
                                "&recipient_name=AEON.to" +
                                "&tx_description=Paying%20" + btc_amount + "%20BTC%20to%20" + btc_dest_address;
                            new QRCode(document.getElementById("aeonto-qrcode"), qrstring);

                            if (state == "UNDERPAID") {
                                $("#aeonto-lens-modal .aeonto-remaining-amount").text(
                                    chrome.i18n.getMessage("remaining_pre") + " " + remaining_amount_incoming + " " + 
                                    chrome.i18n.getMessage("remaining_mid") + " " + incoming_amount_total + " " +
                                    chrome.i18n.getMessage("remaining_post")
                                );
                            } else {
                                $("#aeonto-lens-modal .aeonto-remaining-amount").text(remaining_amount_incoming + " AEON");
                            }

                        } else {
                            // payment already received, so show the status only
                            $("#aeonto-lens-modal").html(status_outer);
                        }

                        switch (state) {
                            case "TO_BE_CREATED":
                                show_status(chrome.i18n.getMessage("state_tobecreated") + " " + spinner);
                                break;
                            case "UNPAID":
                                show_status(chrome.i18n.getMessage("state_unpaid") + " " + spinner);
                                break;
                            case "UNDERPAID":
                                show_status(chrome.i18n.getMessage("state_underpaid") + " " + spinner);
                                break;
                            case "PAID_UNCONFIRMED":
                                show_status(chrome.i18n.getMessage("state_unconfirmed") + " " + spinner, order_create_res.uuid);
                                break;
                            case "PAID":
                                show_status(chrome.i18n.getMessage("state_paid") + " " + spinner);
                                break;
                            case "BTC_SENT":
                                show_success(
                                    "<div>" + chrome.i18n.getMessage("orderkey") + ":</div>" +
                                    "<div class='text-white'>" + order_create_res.uuid + "</div>" +
                                    "<div class='vspace-10'></div>" +
                                    "<div>" +
                                        "<span class='text-white'>" + incoming_amount_total + " AEON</span> " +
                                        chrome.i18n.getMessage("success_part1") + " <span class='text-white'>" + btc_amount + " BTC</span> " +
                                        chrome.i18n.getMessage("success_part2") +
                                    " </div>" +
                                    "<div class='text-white'>" + btc_dest_address + "</div>" +
                                    "<div class='vspace-10'></div>" +
                                    "<div>" + chrome.i18n.getMessage("success_txid") + ":</div>" +
                                    "<div class='text-white text-small'>" + btc_transaction_id + "</div>" +
                                    "<div class='vspace-10'></div>" +
                                    "<div>" + chrome.i18n.getMessage("success_numconfirm") + ": <span class='text-white'>" + btc_num_confirmations + "</span></div>"
                                );
                                return;
                            case "TIMED_OUT":
                                show_error(chrome.i18n.getMessage("state_timedout"));
                                clearInterval(interval_id);
                                return;
                            case "NOT_FOUND":
                                show_error(chrome.i18n.getMessage("state_notfound"));
                                clearInterval(interval_id);
                                return;
                        }
                    });
                }

                if (state == "UNPAID" || state == "UNDERPAID") {
                    var minutes = Math.floor(seconds_till_timeout / 60);
                    var seconds = seconds_till_timeout - minutes * 60;
                    var timeText = (minutes < 10 ? "0" : "") + minutes + ":" + (seconds < 10 ? "0" : "") + seconds;
                    $("#aeonto-lens-modal .aeonto-timer").text(chrome.i18n.getMessage("expire_pre") + " " + timeText + " " + chrome.i18n.getMessage("expire_post"));
                }

                ticks++;
            }, 1000);
        });
    });

    $("#aeonto-lens-modal .aeonto-min-limit").html(spinner);
    $("#aeonto-lens-modal .aeonto-max-limit").html(spinner);
    $("#aeonto-lens-modal .aeonto-rate").html(spinner);

    already_injected = true; // only inject once
}

icon_url = chrome.extension.getURL("lens_icon.svg");

function wrapMatchesInNode(textNode) {
    var temp = document.createElement('div');
    saferInnerHTML(temp, textNode.data.replace(btc_regex, '$& <a class="aeonto-lens-link" href="#" data-address="$&"><img style="height:12px" title="' + chrome.i18n.getMessage('tooltip') + '" src="' + icon_url + '"></a> '));
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

var isTestNet, isProdNet;
var endpoint = 'https://aeon.to/api/v3';

$(function() {
    $("body").on("click", '.aeonto-lens-link', function(event) {
        // When the user clicks on one of the fox icons embedded on the page,
        // this function gets called which launches the modal.
        event.preventDefault();
        var address = $(this).data('address');

        // detect wallet address type
        isTestNet = validate(address, 'bitcoin', 'testnet');
        isProdNet = validate(address, 'bitcoin', 'prod');

        // change endpoint to use stagenet
        if (isTestNet) {
          endpoint = 'https://test.aeon.to/api/v3';
        } else if (isProdNet) {
          endpoint = 'https://aeon.to/api/v3';
        } else {
          // exit if address is not valid
          return;
        }

        console.log('opening');

      $.get(endpoint + "/aeon2btc/order_parameter_query/", function(response) {
        if(response.error) {
          show_error("AEON.to API returned an error: " + response.error_msg);
          return;
        }

        if (isTestNet) {
          $('.stagenet-label').show();
        } else {
          $('.stagenet-label').hide();
        }

        lower_limit = response.lower_limit;
        upper_limit = response.upper_limit;
        $("#aeonto-lens-modal .aeonto-estimation-amount").text(response.zero_conf_max_amount + " BTC");
        $("#aeonto-lens-modal .aeonto-min-limit").text(response.lower_limit + " BTC");
        $("#aeonto-lens-modal .aeonto-max-limit").text(response.upper_limit + " BTC");
        $("#aeonto-lens-modal .aeonto-rate").text("1 AEON = " + response.price + " BTC");
      });

        $("#aeonto-lens-modal .aeonto-address").val(address);
        $("#aeonto-lens-modal").dialog({
            show: { effect: "fade", duration: 300 },
            dialogClass: 'aeonto-dialog',
            width: "600px",
            title: "AEON.to Lens",
            close: function(event) {
                $("#aeonto-lens-modal").remove();
                already_injected = false;
                inject_modal();
                clearInterval(interval_id);
            },
        });
    });
});