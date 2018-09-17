var spinner = '<div class="spinner"><div class="bounce1"></div><div class="bounce2"></div><div class="bounce3"></div></div>';
var interval_id;

var modal = {
  btc_amount: 0,
  show_error: function (msg) {
    // At any point in the process, if the XMR.TO api returns any kind of error,
    // this text gets placed into the page.
    $("#xmrto-lens-modal").html(
      "<div class='ui-state-error ui-corner-all xmrto-error'>" +
      "XMR.TO API returned an Error:<br><br>" +
      "<span class='ui-state-error-text xmrto-error-text'>" + msg + "</span>" +
      "</div>"
    );
  },
  show_success: function (msg) {
    // when the enire transaction is complete bring up this page telling them
    // the transaction went successfully.
    $("#xmrto-lens-modal").html(
      "<div class='xmrto-success'>" +
      "<div class='text-orange text-bold text-xlarge'>" + chrome.i18n.getMessage("success_header") + "</div>" +
      "<div class='vspace-10'></div>" +
      msg +
      "</div>"
    );
  },
  show_status: function(msg, uuid) {
    $("#xmrto-lens-modal .xmrto-status").html(
      "<div class='pull-left'>" + chrome.i18n.getMessage("status") + ": <span class='text-white'>" + msg + "</span></div>" +
      (uuid === undefined ? "" :
        "<div class='pull-left'>" + chrome.i18n.getMessage("orderkey") + ": <span class='text-white'>" + uuid + "</span></div>")
    );
  },
  remove_modal: function () {
    $('.modal-container').remove();
  },
  on_input: function (lower_limit, upper_limit) {
    var self = this;
    $("#xmrto-lens-modal .xmrto-amount").on("input", function () {
      self.btc_amount = $("#xmrto-lens-modal .xmrto-amount").val();
      $("#xmrto-lens-modal .xmrto-pay-button").prop("disabled", self.btc_amount < lower_limit || upper_limit < self.btc_amount);
    });
  },
  on_submit: function (endpoint, btc_dest_address) {
    var self = this;
    $("#xmrto-lens-modal .xmrto-pay-button").click(function () {
      var order_create_param = {
        btc_amount: self.btc_amount,
        btc_dest_address: btc_dest_address
      };
      $("#xmrto-lens-modal").html("<span class='hspace-10'></span>" + chrome.i18n.getMessage("calling_api") + spinner);
      $.post(endpoint + "/xmr2btc/order_create/", order_create_param).done(function (order_create_res) {
        if (order_create_res.error) {
          self.show_error(order_create_res.error_msg);
          return;
        }
        var ticks = 0;
        var state;
        var seconds_till_timeout;
        interval_id = setInterval(function () {
          if (seconds_till_timeout) {
            seconds_till_timeout--;
          }
          // cehck the satus every 5 seconds
          if (ticks % 5 === 0) {
            $.post(endpoint + "/xmr2btc/order_status_query/", {uuid: order_create_res.uuid}).done(function (order_status_query_res) {
              if (order_status_query_res.error) {
                self.show_error(order_status_query_res.error_msg);
                clearInterval(interval_id);
                return;
              }

              var btc_num_confirmations = order_status_query_res.btc_num_confirmations;
              var btc_transaction_id = order_status_query_res.btc_transaction_id;
              var xmr_amount_total = order_status_query_res.xmr_amount_total;
              var xmr_amount_remaining = order_status_query_res.xmr_amount_remaining;
              var xmr_receiving_integrated_address = order_status_query_res.xmr_receiving_integrated_address;
              var xmr_required_amount = order_status_query_res.xmr_required_amount;

              state = order_status_query_res.state;
              seconds_till_timeout = order_status_query_res.seconds_till_timeout;

              var panel_body =
                "<div class='xmrto-panel-body'>" +
                "<div>" + chrome.i18n.getMessage("send_pre") + " <span class='xmrto-remaining-amount text-white'></span> " + chrome.i18n.getMessage("send_post") + ":<div>" +
                "<div class='text-white' style='word-wrap: break-word'>" + xmr_receiving_integrated_address + "</div>" +
                "<div class='vspace-20'></div>" +
                "<div>" + chrome.i18n.getMessage("convert_pre") + " <span class='text-white'>" + self.btc_amount + "</span> " + chrome.i18n.getMessage("convert_post") + "</div>" +
                "<div class='text-white'>" + btc_dest_address + "</div>" +
                "<div class='vspace-10'></div>" +
                "<div>" + chrome.i18n.getMessage("orderkey") + ":</div>" +
                "<div class='text-white'>" + order_create_res.uuid + "</div>" +
                "<div class='vspace-10'></div>" +
                "<div>" + chrome.i18n.getMessage("commandline") + ":</div>" +
                "<div class='text-xsmall'><textarea class='width-100' style='height:60px' onclick='self.select()'>transfer normal 4 " + xmr_receiving_integrated_address + " " + xmr_amount_remaining + "</textarea></div>" +
                "<div class='vspace-10'></div>" +
                "<div>" + chrome.i18n.getMessage("qrcode") + ":</div>" +
                "<div id='xmrto-qrcode'></div>" +
                "</div>";

              var status_outer =
                "<div class='xmrto-status-outer'>" +
                "<div class='xmrto-status pull-left'></div>" +
                "<div class='xmrto-timer pull-right'></div>" +
                "</div>";

              if (state === "UNPAID" || state === "UNDERPAID") {
                $("#xmrto-lens-modal").html(panel_body + status_outer);

                var qrstring =
                  "monero:" + xmr_receiving_integrated_address +
                  "?tx_amount=" + xmr_amount_remaining +
                  "&recipient_name=XMR.TO" +
                  "&tx_description=Paying%20" + self.btc_amount + "%20BTC%20to%20" + btc_dest_address;
                new QRCode(document.getElementById("xmrto-qrcode"), qrstring);

                if (state === "UNDERPAID") {
                  $("#xmrto-lens-modal .xmrto-remaining-amount").text(
                    chrome.i18n.getMessage("remaining_pre") + " " + xmr_amount_remaining + " " +
                    chrome.i18n.getMessage("remaining_mid") + " " + xmr_amount_total + " " +
                    chrome.i18n.getMessage("remaining_post")
                  );
                } else {
                  $("#xmrto-lens-modal .xmrto-remaining-amount").text(xmr_amount_remaining + " XMR");
                }

              } else {
                // payment already received, so show the status only
                $("#xmrto-lens-modal").html(status_outer);
              }

              switch (state) {
                case "TO_BE_CREATED":
                  self.show_status(chrome.i18n.getMessage("state_tobecreated") + " " + spinner);
                  break;
                case "UNPAID":
                  self.show_status(chrome.i18n.getMessage("state_unpaid") + " " + spinner);
                  break;
                case "UNDERPAID":
                  self.show_status(chrome.i18n.getMessage("state_underpaid") + " " + spinner);
                  break;
                case "PAID_UNCONFIRMED":
                  self.show_status(chrome.i18n.getMessage("state_unconfirmed") + " " + spinner, order_create_res.uuid);
                  break;
                case "PAID":
                  self.show_status(chrome.i18n.getMessage("state_paid") + " " + spinner);
                  break;
                case "BTC_SENT":
                  self.show_success(
                    "<div>" + chrome.i18n.getMessage("orderkey") + ":</div>" +
                    "<div class='text-white'>" + order_create_res.uuid + "</div>" +
                    "<div class='vspace-10'></div>" +
                    "<div>" +
                    "<span class='text-white'>" + xmr_required_amount + " XMR</span> " +
                    chrome.i18n.getMessage("success_part1") + " <span class='text-white'>" + self.btc_amount + " BTC</span> " +
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
                  self.show_error(chrome.i18n.getMessage("state_timedout"));
                  clearInterval(interval_id);
                  return;
                case "NOT_FOUND":
                  self.show_error(chrome.i18n.getMessage("state_notfound"));
                  clearInterval(interval_id);
                  return;
              }
            });
          }

          if (state === "UNPAID" || state === "UNDERPAID") {
            var minutes = Math.floor(seconds_till_timeout / 60);
            var seconds = seconds_till_timeout - minutes * 60;
            var timeText = (minutes < 10 ? "0" : "") + minutes + ":" + (seconds < 10 ? "0" : "") + seconds;
            $("#xmrto-lens-modal .xmrto-timer").text(chrome.i18n.getMessage("expire_pre") + " " + timeText + " " + chrome.i18n.getMessage("expire_post"));
          }

          ticks++;
        }, 1000);
      });
    });
  },
  inject_address_modal: function (data) {
    var zero_conf_max_amount = data.zero_conf_max_amount;
    var lower_limit = data.lower_limit;
    var upper_limit = data.upper_limit;
    var price = data.price;
    var address = data.address;
    var endpoint = data.endpoint;

    $('body').append(
      "<div id='xmrto-lens-modal' class='modal-container'>" +
      "<div class='xmrto-panel-header'>" +
      "<div class='pull-left'>" + chrome.i18n.getMessage("min") + ": <span class='xmrto-min-limit text-white'>" + lower_limit + " BTC" + "</span> " + chrome.i18n.getMessage("max") + ": <span class='xmrto-max-limit text-white'>" + lower_limit + " BTC" + "</span></div>" +
      "<div class='pull-right'>" + chrome.i18n.getMessage("rate") + ": <span class='xmrto-rate text-white'>" + "1 XMR = " + price + " BTC" + "</span></div>" +
      "</div>" +
      "<div class='xmrto-panel-body'>" +
      "<div class='stagenet-label'>stagenet</div>" +
      "<div>" +
      "<span class='text-white'>" + chrome.i18n.getMessage("destination") + ":</span>" +
      "<input class='xmrto-address xmrto-form-control' value=" + address + " disabled />" +
      "</div>" +
      "<div class='vspace-20'></div>" +
      "<div>" +
      "<span class='text-white'>" + chrome.i18n.getMessage("amount_in_bitcoin") + ":</span>" +
      "<input class='xmrto-amount xmrto-form-control' type=number />" +
      "<button class='xmrto-pay-button width-30 pull-right' disabled>" + chrome.i18n.getMessage("pay") + "</button>" +
      "</div>" +
      "<div class='xmrto-estimation-time'>" + chrome.i18n.getMessage("estimation_pre") + " <span class='xmrto-estimation-amount'>" + zero_conf_max_amount + " BTC" + "</span> " + chrome.i18n.getMessage("estimation_post") + " </div>" +
      "</div>" +
      "</div>"
    );
    // on amount change
    this.on_input(lower_limit, upper_limit);
    // on 'Pay' button click
    this.on_submit(endpoint, address);

    // open modal dialog
    $("#xmrto-lens-modal").dialog({
      show: {effect: "fade", duration: 300},
      dialogClass: 'xmrto-dialog',
      width: "600px",
      title: "XMR.TO Lens",
      close: function () {
        $("#xmrto-lens-modal").remove();
        clearInterval(interval_id);
      },
    });
  }
};
