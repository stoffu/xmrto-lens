
function round(value, exp) {
  if (typeof exp === 'undefined' || +exp === 0)
    return Math.round(value);

  value = +value;
  exp  = +exp;

  if (isNaN(value) || !(typeof exp === 'number' && exp % 1 === 0))
    return NaN;

  // Shift
  value = value.toString().split('e');
  value = Math.round(+(value[0] + 'e' + (value[1] ? (+value[1] + exp) : exp)));

  // Shift back
  value = value.toString().split('e');
  return +(value[0] + 'e' + (value[1] ? (+value[1] - exp) : -exp));
}


// Change to "//" when shapeshift.io's api supports HTTPS.
// until then, the extension will break on https pages.
var ssio_protocol = "https://";

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
    // At any point in the process, if the shapeshift api returns any kind of error,
    // this text gets placed into the page.

    $("#shapeshift-lens-modal").html(
        "<div class='ui-state-error ui-corner-all ssio-error'>" +
            "ShapeShift.io API returned an Error:<br><br>" +
            "<span class='ui-state-error-text ssio-error-text'>" + msg + "</span>" +
        "</div>"
    );
    $("#shapeshift-lens-modal").dialog("option", "buttons", []);
}

function show_success(msg) {
    // when the enire transaction is complete bring up this page telling them
    // the transaction went successfully.

    $("#shapeshift-lens-modal").html(
        "<div class='ui-state-highlight ui-corner-all ssio-success'>" +
            "Success!<br><br>" +
            "<span class='ssio-success-text'>" + msg + "</span><br><br> " +
            "<br><a href='#' class='ssio-finish'>Finish</a>" +
        "</div>"
    );
    $("#shapeshift-lens-modal").dialog("option", "buttons", []);
}

function show_status(msg) {
    $("#shapeshift-lens-modal .ssio-status").html(msg);
}

var altcoin_deposit_limit = '' // defined here (globally) because it is used in a bunch of places
var spinner = '<div class="spinner"><div class="bounce1"></div><div class="bounce2"></div><div class="bounce3"></div></div>';
var interval_id;
var pay_button_clicked;

var already_injected = false;
function inject_modal() {
    if(already_injected) {
        return
    }
    $('body').append(
    "<div id='shapeshift-lens-modal'>" +
        "<div class='ssio-all'>" +
            "<div class='rates'>" +
                "<div class='pull-left'>Deposit Limit: <span class='ssio-limit'></span></div>" +
                "<div class='pull-right'>Exchange Rate: <span class='ssio-exchange-rate'></span></div>" +
            "</div>"+
            "<div class='ssio-panel-body'>" +
            "<div class='top-body clearfix'>" +
            "<span class='ssio-label'>Destination:</span>" +
            "<div class='ssio-form-item ssio-col-md-8'><input class='ssio-address ssio-form-control' disabled></div>" +
            "<div class='ssio-form-item ssio-col-md-4'><input class='ssio-amount ssio-form-control' data-trigger='focus' data-toggle='popover' data-placement='left' data-content='Use this to specify an exact amount of Bitcoin for the destination address (useful for paying invoices, etc)' placeholder='Amount'></div>" +
            "</div>" +
            "<div class='pay-with'><select class='ssio-currency-dropdown'>" +
                "<option value='---'>Pay with:</option>" +
            "</select></div>" +
	            "<div class='ssio-form-item last' style='visibility:hidden;position:absolute'><input class='ssio-form-control ssio-return-address' data-trigger='focus' data-toggle='popover' data-placement='left' data-content='Any deposit greater than the deposit limit will be returned only if a return address has been entered. Otherwise you must contact shapeshift.io support for any returns.' placeholder='Return Address (Optional)'></div>" +
            "</div>" +
        "</div>" +
    "</div>"
    );

    

    var pay_button_clicked_ssio = function (event) {
        // This function gets fired when the pay button is clicked. It fires off
        // the "shift" api call, then starts the timers.

        var btc_address = $("#shapeshift-lens-modal .ssio-address").val();
        var return_address = $('#shapeshift-lens-modal .ssio-return-address').val();
        var currency = "xmr";
        var altcoin_name = "Monero";
        var altcoin_icon = "<img src='https://shapeshift.io/images/coins/monero.png'>";
        var bitcoin_icon = "<img src='https://shapeshift.io/images/coins/bitcoin.png'>";
		var public_key = '';
		var nice_rsAddress = '';
        var pair = currency + "_btc";
        var btc_amount = $("#shapeshift-lens-modal .ssio-amount").val()
        if (!btc_amount) {
            return;
        }
        $("#shapeshift-lens-modal").dialog("option", "buttons", []);

        $("#shapeshift-lens-modal").html("Calling ShapeShift.io's API..." + spinner);

        if(btc_amount) {
            data = {withdrawal: btc_address, pair: pair, amount: btc_amount, returnAddress: return_address};
            url = "shapeshift.io/sendamount"
        }

        $.post(ssio_protocol + url, data).done(function(response) {
            // This gets executed when the call to the API to get the deposit
            // address.

            if(response.error) {
                show_error(response.error);
                return;
            }
			var deposit_text = '';
            var amount = null;
            var expiration = null;
			var seconds_remaining = null;
			var sAddress_value = '';
			var message = '';
            if(response.success) {
                // response came from call to 'sendamount'
                var deposit = response.success.deposit;
                var amount = response.success.depositAmount;
                expiration = response.success.expiration;
                public_key = response.success.public;
	            destTag = response.success.xrpDestTag;
				depositType = response.success.depositType;
				sAddress = response.success.sAddress;
            } else {
                // response came from call to 'shift'
                var deposit = response.deposit;
                public_key = response.public;
				destTag = response.xrpDestTag;
				depositType = response.depositType;
				sAddress = response.sAddress;
            }
			if(public_key) {
				nice_rsAddress = '<span class="public-key">' + public_key + '</span>';
			}
            var deposit_type = response.depositType;
	        if(deposit_type == 'BTS' || deposit_type == 'BITUSD') {
		        deposit_text = '<strong>shapeshiftio</strong> ' + 'MEMO: ';
		        $('.depo-label').text('Deposit Account:');
	        }

	        if(sAddress) {
		        sAddress_value = '<div class="long">' + sAddress + '</div>';
		        deposit_text = 'PaymentID: ';
		        $('.depo-label').text('PaymentID:');
		        message = '<div class="alert alert-warning"><b>Do not send without a PaymentId </b> your funds will be unrecoverable if you do!</div>';
		        
	        }

            if(amount) {
                var show_amount = "<b>" + amount + "</b> ";
            } else {
                var show_amount = "up to <b>" + altcoin_deposit_limit + "</b>";
            }

            var final_modal = "<span class='ssio-deposit'>" +
                "Send " + show_amount + " " + altcoin_icon + " " + altcoin_name +
                " to <br>" + "<span class='depo-address'>" + sAddress_value + deposit_text + '<div class="long">' + deposit + "</div></span>" + nice_rsAddress + message +
                "</span>" +
                "<div id='ssio-qrcode'></div>" +
                "<br>" +
                "<span class='ssio-recipient'>It will be converted into " + bitcoin_icon + " Bitcoin, and sent to<br>" + "<span class='depo-address'>" + btc_address + "</span>";

            if(amount) {
                final_modal += "<br> as <b>" + btc_amount + "</b> BTC";
            }

            final_modal += "</span><div class='ssio-status-outer'><div class='ssio-status ssio-pull-left'></div><div class='ssio-timer ssio-pull-right'></div></div>"

            $("#shapeshift-lens-modal").html(final_modal);
/*
			var qrstring = deposit;
			if(amount)
			{
				qrstring = altcoin_name.toLowerCase()+":"+deposit+"?amount="+amount;
			}
            new QRCode(document.getElementById("ssio-qrcode"), qrstring);
*/
            var ticks = 0;
            interval_id = setInterval(function() {

                if(ticks % 8 == 0) {
                    // every eight seconds get the current status of any deposits.
                    // by making a call to shapeshift's api
                    $.get(ssio_protocol + "shapeshift.io/txStat/" + deposit, {timeout: 4500}).done(function(response) {
                        var status = response.status;

                        if(status == 'no_deposits') {
                            show_status("Status: Awaiting Your " + altcoin_name + " " + spinner);
                        } else if (status == 'received') {
                            show_status("Status: Payment Received, waiting for confirmation. " + spinner);
                            expiration = null;
                        } else if (status == 'complete') {
                            console.log(response);
                            var in_type = response.incomingType;
                            var incoming = response.incomingCoin;
                            var outgoing = response.outgoingCoin;
                            var withdraw = response.withdraw;
                            var txid = response.transaction;

                            show_success("<div class='ssio-in-out'>" + incoming + " " + altcoin_icon + " " + in_type + " was converted to " + outgoing + " " + bitcoin_icon + " BTC and sent to " + "<strong>" + withdraw + "</strong></div>");

                            clearInterval(interval_id);
                            expiration = null;
                            return
                        } else if (status == 'failed') {
                            show_error("ShapeShift.io API returned an error: " + response.error);
                            clearInterval(interval_id); //halt ticking process
                            return
                        }
                    });
						
                }
				
				$.get(ssio_protocol + "shapeshift.io/timeremaining/" + deposit, {timeout: 4500}).done(function(response) {
                        
						seconds_remaining = response.seconds_remaining;
                    });

                if (seconds_remaining )//|| expiration)
                {
					
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
                        $("#shapeshift-lens-modal .ssio-timer").text(timeText + " until expiration");
                    } else {
                        show_error("Time Expired! Please try again.");
                        clearInterval(interval_id);
                        return
                    }
                } else {
                    $("#shapeshift-lens-modal .ssio-timer").text('');
                }

                ticks++;
            }, 1000);

        }).error(function(response) {
            if(response.error) {
                show_error(response.error);
                return;
            }
        });
    }

    pay_button_clicked = function(event) {
        var currency = "xmr";
        var altcoin_name = "Monero";
        var altcoin_icon = "<img src='https://shapeshift.io/images/coins/monero.png'>";
        var bitcoin_icon = "<img src='https://shapeshift.io/images/coins/bitcoin.png'>";

        var btc_amount = $("#shapeshift-lens-modal .ssio-amount").val()
        if (!btc_amount) {
            return;
        }
        $("#shapeshift-lens-modal").dialog("option", "buttons", []);

        var btc_dest_address = $("#shapeshift-lens-modal .ssio-address").val();

        var order_create_param = {
            btc_amount: btc_amount,
            btc_dest_address: btc_dest_address
        };
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

                        var state = order_status_query_res.state;
                        // var btc_amount = order_status_query_res.btc_amount;
                        // var btc_dest_address = order_status_query_res.btc_dest_address;
                        // var uuid = order_status_query_res.uui;
                        // var btc_num_confirmations = order_status_query_res.btc_num_confirmations;
                        // var btc_num_confirmations_before_purge = order_status_query_res.btc_num_confirmations_before_purge;
                        var btc_transaction_id = order_status_query_res.btc_transaction_id;
                        // var created_at = order_status_query_res.created_at;
                        // var expires_at = order_status_query_res.expires_at;
                        var seconds_till_timeout = order_status_query_res.seconds_till_timeout;
                        var xmr_amount_total = order_status_query_res.xmr_amount_total;
                        var xmr_amount_remaining = order_status_query_res.xmr_amount_remaining;
                        var xmr_num_confirmations_remaining = order_status_query_res.xmr_num_confirmations_remaining;
                        // var xmr_price_btc = order_status_query_res.xmr_price_btc;
                        var xmr_receiving_address = order_status_query_res.xmr_receiving_address;
                        var xmr_required_amount = order_status_query_res.xmr_required_amount;
                        var xmr_required_payment_id = order_status_query_res.xmr_required_payment_id;

                        seconds_remaining = state == "UNPAID" || state == "UNDERPAID" ? seconds_till_timeout : null;

                        var final_modal = "<span class='ssio-deposit'>" +
                            "Send " + xmr_amount_remaining + " " + altcoin_icon + " " + altcoin_name +
                            " to <br>" + "<span class='depo-address'>" + xmr_receiving_address + "</span> " +
                            "<br>with Payment ID " + xmr_required_payment_id
                            "</span>" +
                            "<div id='ssio-qrcode'></div>" +
                            "<br>" +
                            "<span class='ssio-recipient'>It will be converted into " + bitcoin_icon + " Bitcoin, and sent to<br>" + "<span class='depo-address'>" + btc_dest_address + "</span>" +
                            "<br> as <b>" + btc_amount + "</b> BTC" +
                            "</span><div class='ssio-status-outer'><div class='ssio-status ssio-pull-left'></div><div class='ssio-timer ssio-pull-right'></div></div>";

                        //var qrstring = deposit;
                        //if(amount)
                        //{
                        //    qrstring = altcoin_name.toLowerCase()+":"+deposit+"?amount="+amount;
                        //}
                        //new QRCode(document.getElementById("ssio-qrcode"), qrstring);

                        $("#shapeshift-lens-modal").html(final_modal);

                        switch (state) {
                            case "TO_BE_CREATED":
                                show_status("Status: order creation pending. " + spinner);
                                break;
                            case "UNPAID":
                                show_status("Status: Awaiting Your " + altcoin_name + " " + spinner);
                                break;
                            case "UNDERPAID":
                                show_status("Status: Awaiting Your " + altcoin_name + " (underpaid) " + spinner);
                                break;
                            case "PAID_UNCONFIRMED":
                                show_status("Status: Payment Received, waiting for confirmation. " + spinner);
                                break;
                            case "PAID":
                                show_status("Status: Payment received and confirmed, now sending BTC. " + spinner);
                                break;
                            case "BTC_SENT":
                                show_success("<div class='ssio-in-out'>" + incoming + " " + altcoin_icon + " " + in_type + " was converted to " + outgoing + " " + bitcoin_icon + " BTC and sent to " + "<strong>" + withdraw + "</strong></div>");
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
                    
                    console.log(seconds);
                    if(seconds > 0) {
                        $("#shapeshift-lens-modal .ssio-timer").text(timeText + " until expiration");
                    } else {
                        show_error("Time Expired! Please try again.");
                        clearInterval(interval_id);
                        return;
                    }
                } else {
                    $("#shapeshift-lens-modal .ssio-timer").text('HOGEHOGE');
                }

                ticks++;
            }, 1000);
        });
    };

	        $('.ssio-limit, .ssio-exchange-rate').fadeIn();
	        var altcoin_symbol = "xmr"
	        var pair = "btc_" + altcoin_symbol;
	
	        $("#shapeshift-lens-modal .ssio-exchange-rate").html(spinner);
	        $("#shapeshift-lens-modal .ssio-limit").html(spinner);
			
	        $('#shapeshift-lens-modal .ssio-more-options').show();
	
	        $.get(ssio_protocol + "xmr.to/api/v1/xmr2btc/order_parameter_query/", function(response) {
	            if(response.error) {
	                show_error("XMR.TO API returned an error: " + response.error_msg);
	                return;
	            }
	            $("#shapeshift-lens-modal .ssio-exchange-rate").text("1 XMR = " + response.price + " BTC");
	
                    var lower_limit = response.lower_limit;
	                var upper_limit = response.upper_limit;
	
	                $("#shapeshift-lens-modal .ssio-limit").text("min/max: " + lower_limit + "/" + upper_limit + " BTC");
	
	        }).error(function(response) {
	            show_error("General Ajax failure");
	        });

    already_injected = true; // only inject once
}

icon_url = chrome.extension.getURL("19x19_2.png");

function wrapMatchesInNode(textNode) {

    var temp = document.createElement('div');

    temp.innerHTML = textNode.data.replace(btc_regex, '$&<a class="shapeshift-lens-link" href="#" data-address="$&"><img title="Click to send altcoins to this BTC address" src="' + icon_url + '"></a> ');

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
	
    $("body").on("click", '.shapeshift-lens-link', function(event) {
        // When the user clicks on one of the fox icons embedded on the page,
        // this function gets called which launches the modal.
        event.preventDefault();
        var address = $(this).data('address');
        //chrome.runtime.sendMessage({clicked_address: address});







        $("#shapeshift-lens-modal .ssio-address").val(address);
        $("#shapeshift-lens-modal").dialog({
            show: { effect: "fade", duration: 300 },
            dialogClass: 'ssio-dialog',
            width: "600px",
            title: "ShapeShift Lens",
            close: function(event) {
                $("#shapeshift-lens-modal").remove();
                already_injected = false;
                inject_modal();
                clearInterval(interval_id);
            },
            buttons: [ {text: "Cancel", click: function() {$(this).dialog('close');}}, { text: "Pay", click: pay_button_clicked }]
        });

        $("body").on("click", ".ssio-finish", function (event) {
            event.preventDefault();
            $("#shapeshift-lens-modal").dialog("close");
        });
        //show_success("induced success");
        $('input[data-toggle="popover"]').focus(function(){

        });
		$('input[data-toggle="popover"]').on('blur', function(){
		   $('.ssio-popover').fadeOut().remove();
		}).on('focus', function(){
		  	var width = $(this).width() + 10;
	        var content = $(this).attr('data-content');
	        $('<div role="tooltip" class="ssio-popover right" id="popover83172" style="display: none; left:' + width + 'px;"><div class="arrow"></div><div class="popover-content">' + content + '</div></div>').insertAfter(this).fadeIn();
	        var popHeight = $('.ssio-popover').height() + 5;
	        $('.ssio-popover').css({top: '50%', 'margin-top': -popHeight / 2});
		});
    });

});
