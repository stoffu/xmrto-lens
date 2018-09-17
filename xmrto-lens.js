var btc_regex = /\b[123mn][a-km-zA-HJ-NP-Z0-9]{26,35}\b/g;
var pp_url = /(bitcoin:\?r=)?https:\/\/bitpay.com\/(invoice\?id=|i\/)\w+/g;
var endpoint = 'https://xmr.to/api/v2';
var icon_url = chrome.extension.getURL("lens_icon_12.png");
var is_prod_net;
var is_test_net;

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
        if (btc_regex.test(node.data) || pp_url.test(node.data)) {
            //console.log('found node with BTC addresses', node.parentNode.id);
            wrapMatchesInNode(node);
            chrome.runtime.sendMessage({address_present: true});
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
}

function wrapMatchesInNode(textNode) {
    var temp = document.createElement('div');
    temp.innerHTML = textNode.data.replace(btc_regex, '$&<a class="xmrto-lens-link" href="#" data-address="$&"><img title="' + chrome.i18n.getMessage('tooltip') + '" src="' + icon_url + '"></a> ');
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

$(function () {
  $("body").on("click", '.xmrto-lens-link', function (event) {
    // When the user clicks on one of the fox icons embedded on the page,
    // this function gets called which launches the modal.
    event.preventDefault();
    var address = $(this).data('address');

    // detect wallet address type
    is_test_net = validate(address, 'bitcoin', 'testnet');
    is_prod_net = validate(address, 'bitcoin', 'prod');

    // change endpoint to use stagenet
    if (is_test_net) {
      endpoint = 'https://test.xmr.to/api/v2';
    } else if (is_prod_net) {
      endpoint = 'https://xmr.to/api/v2';
    } else {
      // exit if address is not valid
      return;
    }

    modal.remove_modal();

    // request order parameters
    $.get(endpoint + "/xmr2btc/order_parameter_query/", function (response) {
      if (response.error) {
        show_error("XMR.TO API returned an error: " + response.error_msg);
        return;
      }

      if (is_test_net) {
        $('.stagenet-label').show();
      } else {
        $('.stagenet-label').hide();
      }

      modal.inject_address_modal({
        zero_conf_max_amount: response.zero_conf_max_amount,
        lower_limit: response.lower_limit,
        upper_limit: response.upper_limit,
        price: response.upper_limit,
        address: address,
        endpoint: endpoint,
      });
      // update modal data
    });
  });
});
