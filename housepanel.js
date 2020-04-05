/* javascript file for HousePanel
 * 
 * Developed by Ken Washington @kewashi
 * Designed for use only with HousePanel for Hubitat and SmartThings
 * (c) Ken Washington 2017 - 2020
 * 
 * 02/12/2020 - mods to work with Node.js server version
 * 01/02/2020 - updated to fix z-index bug so things show up on top properly
 * 03/26/2020 - major cleanup and optimization after code inspection
 * 
 */

// globals array used everywhere now
var cm_Globals = {};
cm_Globals.thingindex = null;
cm_Globals.thingidx = null;
cm_Globals.allthings = null;
cm_Globals.options = null;
cm_Globals.returnURL = "";
cm_Globals.hubId = "all";
cm_Globals.client = -1;

var modalStatus = 0;
var modalWindows = {};
var priorOpmode = "Operate";
var pagename = "main";

// set a global socket variable to manage two-way handshake
var wsSocket = null;
var webSocketUrl = null;
var wsinterval = null;
var reordered = false;

// set this global variable to true to disable actions
// I use this for testing the look and feel on a public hosting location
// this way the app can be installed but won't control my home
// end-users are welcome to use this but it is intended for development only
// use the timers options to turn off polling
var disablepub = false;
var disablebtn = false;
var LOGWEBSOCKET = true;

Number.prototype.pad = function(size) {
    var s = String(this);
    while (s.length < (size || 2)) {s = "0" + s;}
    return s;
}

function setCookie(cname, cvalue, exdays) {
    if ( !exdays ) exdays = 30;
    var d = new Date();
    d.setTime(d.getTime() + (exdays*24*60*60*1000));
    var expires = "expires="+ d.toUTCString();
    document.cookie = cname + "=" + cvalue + ";" + expires + ";path=/";
}

function getCookie(cname) {
    var name = cname + "=";
    var decodedCookie = decodeURIComponent(document.cookie);
    var ca = decodedCookie.split(';');
    for(var i = 0; i <ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0) == ' ') {
            c = c.substring(1);
        }
        if (c.indexOf(name) == 0) {
            return c.substring(name.length, c.length);
        }
    }
    return "";
}

function formToObject(id) {
    var myform = document.getElementById(id);
    var formData = new FormData(myform);
    var obj = {};
    for ( var fv of formData.entries() ) {
        if ( typeof obj[fv[0]] === "undefined" ) {
            obj[fv[0]] = fv[1];
        } else if ( typeof obj[fv[0]] === "object" ) {
            obj[fv[0]].push(fv[1]);
        } else {
            obj[fv[0]] = [obj[fv[0]]];
            obj[fv[0]].push(fv[1]);
        }
    }
    return obj;
}


function is_function(obj) {
    var test1 = Object.prototype.toString.call(obj) == '[object Function]';
    var test2 = Function.prototype.isPrototypeOf(obj);
    // console.log("test1= ", test1," test2= ", test2);
    return test1 || test2;
}

function strObject(o, level) {
    var out = '';
    if ( !level ) { level = 0; }
  
    if ( typeof o !== "object") { return o + '\n'; }
    
    for (var p in o) {
      out += '  ' + p + ': ';
      if (typeof o[p] === "object") {
          if ( level > 6 ) {
              out+= ' ...more beyond level 6 \n';
              out+= JSON.stringify(o);
          } else {
              out += strObject(o[p], level+1);
          }
      } else {
          out += o[p] + '\n';
      }
    }
    return out;
}

function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

// don't need the reload feature for Node since we do this every time page loads
// which happens every time after reading all the things from a hub
function getAllthings() {
        var swattr = "none";
        $.post(cm_Globals.returnURL, 
            {useajax: "getthings", id: "none", type: "none", attr: swattr},
            function (presult, pstatus) {
                if (pstatus==="success" && typeof presult==="object" ) {
                    var keys = Object.keys(presult);
                    cm_Globals.allthings = presult;
                    console.log("getAllthings returned from " + cm_Globals.returnURL + " " + keys.length + " things");
                } else {
                    console.log("Error: failure obtaining things from HousePanel: ", presult);
                    cm_Globals.allthings = null;
                }
            }, "json"
        );
}

// obtain options using an ajax api call
// could probably read Options file instead
// but doing it this way ensure we get what main app sees
function getOptions(dosetup) {
    var doreload = "";
    try {
    $.post(cm_Globals.returnURL, 
        {useajax: "getoptions", id: "none", type: "none", attr: doreload},
        function (presult, pstatus) {
            if (pstatus==="success" && typeof presult==="object" && presult.index ) {
                cm_Globals.options = clone(presult);
                var indexkeys = Object.keys(presult.index);
                console.log("getOptions returned: " + indexkeys.length + " things");
                if ( dosetup ) {
                    setupUserOpts();
                }
            } else {
                cm_Globals.options = null;
                console.log("error - failure reading your hmoptions.cfg file");
            }
        }, "json"
    );
    } catch(e) {
        console.log("error - failure reading your hmoptions.cfg file");
    }
}

$(document).ready(function() {
    // set the global return URL value
    try {
        cm_Globals.returnURL = $("input[name='returnURL']").val();
        if ( !cm_Globals.returnURL ) {
            throw "Return URL not defined by host page. Using default.";
        }
    } catch(e) {
        console.log("***Warning*** ", e);
        cm_Globals.returnURL = "http://localhost:3080";
    }

    try {
        pagename = $("input[name='pagename']").val();
    } catch(e) {
        pagename = "main";
    }
    
    try {
        var pathname = $("input[name='pathname']").val();
    } catch(e) {
        pathname = "/";
    }

    // reroute to main page if undefined asked for
    if ( pathname==="/undefined" ) {
        window.location.href = cm_Globals.returnURL;
    }
    // alert(pathname + " returnURL= " + cm_Globals.returnURL);

    // show tabs and hide skin
    if ( pagename==="main" ) {
        $("#tabs").tabs();
        var tabcount = $("li.ui-tabs-tab").length;

        // hide tabs if there is only one room
        if ( tabcount === 1 ) {
            toggleTabs();
        }
    
        // get default tab from cookie and go to that tab
        var defaultTab = getCookie( 'defaultTab' );
        if ( defaultTab && tabcount > 1 ) {
            try {
                $("#"+defaultTab).click();
            } catch (e) {
                defaultTab = $("#roomtabs").children().first().attr("aria-labelledby");
                setCookie('defaultTab', defaultTab, 30);
                try {
                    $("#"+defaultTab).click();
                } catch (f) {
                    console.log(f);
                }
            }
        }
    }
    
    // load things and options
    getAllthings();
    getOptions(true);
    initWebsocket();
    
    // disable return key
    $("body").off("keypress");
    $("body").on("keypress", function(e) {
        if ( e.keyCode===13  ){
            return false;
        }
    });

    // handle button setup for all pages
    setupButtons();

    // handle interactions for the options page
    if (pagename==="options") {
        setupCustomCount();
        setupFilters();
    }

    // handle interactions for main page
    // note that setupFilters will be called when entering edit mode
    if ( pagename==="main" ) {
        setupSliders();
        setupTabclick();
        setupColors();
        cancelDraggable();
        cancelSortable();
        cancelPagemove();
    }

    // finally we wait two seconds then setup page clicks and web sockets
    setTimeout(function() {
        if ( pagename==="main" && !disablepub ) {
            setupPage();
        }
    }, 1000);

});

function getHub(hubnum) {
    var ahub = null;
    try {
        var options = cm_Globals.options;
        var hubs = options.config["hubs"];
    } catch (e) {
        hubs = null;
    }

    if ( hubs && hubnum!=="-1" ) {
        $.each(hubs, function (num, hub) {
            if ( hubnum === hub.hubId ) {
                ahub = hub;
            }
        });
    }
    return ahub;
}

function setupUserOpts() {
    
    // get hub info from options array
    var options = cm_Globals.options;
    if ( !options || !options.config ) {
        console.log("error - valid options file not found.");
        return;
    } else {
        console.log("options config: ", options.config);
    }
    var config = options.config;
    
    // we could disable this timer loop
    // we also grab timer from each hub setting now
    // becuase we now do on-demand updates via webSockets
    // but for now we keep it just as a backup to keep things updated
    try {
        var hubs = config["hubs"];
    } catch(err) {
        console.log ("Couldn't retrieve hubs. err: ", err);
        hubs = null;
    }
    if ( hubs && typeof hubs === "object" ) {
        // loop through every hub
        $.each(hubs, function (num, hub) {
            // var hubType = hub.hubType;
            var timerval;
            var hubId = hub.hubId;
            if ( hub.hubTimer ) {
                timerval = parseInt(hub.hubTimer, 10);
                if ( isNaN(timerval) ) {
                    timerval = 0;
                }
            } else {
                timerval = 0;
            }
            console.log("Timer for hub: ", hub.hubName," = ", timerval);
            if ( timerval >= 1000 ) {
                setupTimer(timerval, "all", hubId);
            }
        });
    }

    // try to get timers
    try {
        var fast_timer = config.fast_timer;
        fast_timer = parseInt(fast_timer, 10);
        var slow_timer = config.slow_timer;
        slow_timer = parseInt(slow_timer, 10);
    } catch(err) {
        console.log ("Couldn't retrieve timers; using defaults. err: ", err);
        fast_timer = 0;
        slow_timer = 3600000;
    }

    // this can be disabled by setting anything less than 1000
    // dont need fast timers for Node since it has state
    // if ( fast_timer && fast_timer >= 1000 ) {
    //     setupTimer(fast_timer, "fast", -1);
    // }

    if ( slow_timer && slow_timer >= 1000 ) {
        setupTimer(slow_timer, "slow", -1);
    }
    
    // TODO: wire up a new time zone feature
    var tzoffset = -5;
    clockUpdater(tzoffset);


}

function initWebsocket() {

    // get the webSocket info and the timers
    try {
        webSocketUrl = $("input[name='webSocketUrl']").val();
    } catch(err) {
        console.log("Error attempting to retrieve webSocket URL. err: ", err);
        webSocketUrl = null;
    }
    
    // periodically check for socket open and if not open reopen
    if ( webSocketUrl ) {
        wsSocketCheck();
        wsinterval = setInterval(wsSocketCheck, 60000);
    }

}

// check to make sure we always have a websocket
function wsSocketCheck() {
    if ( webSocketUrl!==null && ( wsSocket === null || wsSocket.readyState===3 )  ) {
        setupWebsocket();
    }
    
    if ( !webSocketUrl && wsinterval ) {
        cancelInterval(wsinterval);
    }
}

// send a message over to our web socket
// this can be any message for future use
function wsSocketSend(msg) {
    if ( webSocketUrl && wsSocket && wsSocket.readyState===1 ) {
        if ( typeof msg === "object" ) {
            msg = JSON.stringify(msg);
        }
        wsSocket.send(msg);
    }
}

// new routine to set up and handle websockets
// only need to do this once - I have no clue why it was done the other way before
function setupWebsocket()
{
    try {
        console.log("Creating webSocket for: ", webSocketUrl);
        wsSocket = new WebSocket(webSocketUrl);
    } catch(err) {
        console.log("Error attempting to create webSocket for: ", webSocketUrl," error: ", err);
        return;
    }
    
    // upon opening a new socket notify user and do nothing else
    wsSocket.onopen = function(){
        console.log("webSocket connection opened for: ", webSocketUrl);
    };
    
    wsSocket.onerror = function(evt) {
        console.error("webSocket error observed: ", evt);
    };

    // received a message from housepanel-push or hpserver.js
    // this contains a single device object
    // this is where pushClient is processed for hpserver.js
    wsSocket.onmessage = function (evt) {
        var reservedcap = ["name", "DeviceWatch-DeviceStatus", "DeviceWatch-Enroll", "checkInterval", "healthStatus"];
        try {
            var presult = JSON.parse(evt.data);
            console.log("pushClient: ", presult);
            var bid = presult.id;
            var thetype = presult.type;
            var pvalue = presult.value;
            var client = parseInt(presult.client);
            var clientcount = presult.clientcount;
            var subid = presult.trigger;

            // reload page if signalled from server
            if ( bid==="reload" ) {

                // reload all screens if that is requested
                if ( typeof thetype==="undefined" || thetype==="" || thetype==="/" || thetype==="reload" || thetype==="/reload" ) {
                    var reloadpage =  cm_Globals.returnURL;
                    window.location.href = reloadpage;

                // otherwise a redirect to a specific page is only done on the requesting tablet
                } else {
                    if ( thetype.substr(0,1)!=="/" ) {
                        thetype = "/" + thetype;
                    }
                    reloadpage =  cm_Globals.returnURL + thetype;
                    window.location.href = reloadpage;
                }
                return;
            }

            // handle popups returned from a query
            // this currently is not used but could be later
            if ( presult.popup ) {
                var showstr = "";
                $.each(pvalue, function(s, v) {
                    if ( s!=="password" && !s.startsWith("user_") ) {
                        var txt = v.toString();
                        txt = txt.replace(/<.*?>/g,'');
                        showstr = showstr + s + ": " + txt + "<br>";
                    }
                });
                var winwidth = $("#dragregion").innerWidth();
                var tile = $('div.thing[bid="'+bid+'"][type="'+thetype+'"]');
                var leftpos = $(tile).position().left + 5;
                if ( leftpos + 220 > winwidth ) {
                    leftpos = leftpos - 110;
                }
                var pos = {top: $(tile).position().top + 80, left: leftpos};
                // console.log("popup pos: ", pos, " winwidth: ", winwidth);
                createModal("modalpopup", showstr, "body", false, pos, function(ui) {
                });
            }

            // grab name and subid for console log
            var pname = pvalue["name"] ? pvalue["name"] : "";

            // remove reserved fields
            $.each(reservedcap, function(index, val) {
                if ( pvalue[val] ) {
                    delete pvalue[val];
                }
            });
            
            if ( LOGWEBSOCKET ) {
                console.log("webSocket message from: ", webSocketUrl," bid= ",bid," name:",pname," client:",client," of: ",clientcount," type= ",thetype," subid= ",subid," value= ",pvalue);
            }
        } catch (err) {
            console.log("Error interpreting webSocket message. err: ", err);
            return;
        }
        
        // check if we have valid info for this update item
        if ( bid!==null && thetype && pvalue && typeof pvalue==="object" ) {
        
            // remove color for now until we get it fixed
            if ( pvalue["color"] ) {
                delete( pvalue["color"] );
            }

            // change not present to absent for presence tiles
            // it was an early bad design decision to alter ST's value that I'm now stuck with
            if ( pvalue["presence"] && pvalue["presence"] ==="not present" ) {
                pvalue["presence"] = "absent";
            }
        
            // update all the tiles that match this type and id
            // this now works even if tile isn't on the panel because
            $('div.panel div.thing[bid="'+bid+'"][type="'+thetype+'"]').each(function() {
                try {
                    var aid = $(this).attr("id").substring(2);
                    updateTile(aid, pvalue);
                } catch (e) {
                    console.log("Error updating tile of type: "+ thetype + " and id: " + bid + " with value: ", pvalue);
                }
            });

            // handle links - loop through all tiles that have a link to see if they match
            // because this link shadow field has the real subid triggered we dont have to check subid below
            // console.log("subid= ", subid);
            $('div.panel div[command="' + "LINK" + '"][subid="' + subid + '"]').each(function() {

                // get the id to see if it is the thing being updated
                var linkedtile = $(this).attr("linkval");
                var src = $("div.thing.p_"+linkedtile);
                var lbid = src.attr("bid");

                // if we have a match, update the sibling field
                if ( lbid === bid ) {
                    var sibling = $(this).next();
                    var oldvalue = sibling.html();
                    var oldclass = $(sibling).attr("class");
                    var value = pvalue[subid];

                    // change not present to absent for presence tiles
                    // it was an early bad design decision to alter ST's value that I'm now stuck with
                    if ( subid==="presence" && value==="not present" ) {
                        value = "absent";
                    }

                    // swap out the class and change value
                    if ( oldclass && oldvalue && value &&
                         subid!=="name" && subid!=="trackImage" && subid!=="color" && subid!=='ERR' &&
                         subid!=="trackDescription" && subid!=="mediaSource" &&
                         subid!=="currentArtist" && subid!=="currentAlbum" &&
                         $.isNumeric(value)===false && 
                         $.isNumeric(oldvalue)===false &&
                         oldclass.indexOf(oldvalue)>=0 ) 
                    {
                            $(sibling).removeClass(oldvalue);
                            $(sibling).addClass(value);
                    }
                    $(sibling).html( value );
                }
            });
        }
        
        // note: the old HP processed rules and links here
        // this was moved to the Node server wehre it is far more efficient
    };
    
    // if this socket connection closes then try to reconnect
    wsSocket.onclose = function(){
        console.log("webSocket connection closed for: ", webSocketUrl);
        wsSocket = null;
    };
}

function rgb2hsv(r, g, b) {
     //remove spaces from input RGB values, convert to int
     var r = parseInt( (''+r).replace(/\s/g,''),10 ); 
     var g = parseInt( (''+g).replace(/\s/g,''),10 ); 
     var b = parseInt( (''+b).replace(/\s/g,''),10 ); 

    if ( r===null || g===null || b===null ||
         isNaN(r) || isNaN(g)|| isNaN(b) ) {
        return {"hue": 0, "saturation": 0, "level": 0};
    }
    
    if (r<0 || g<0 || b<0 || r>255 || g>255 || b>255) {
        return {"hue": 0, "saturation": 0, "level": 0};
    }
    r /= 255, g /= 255, b /= 255;

    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h, s, v = max;

    var d = max - min;
    s = max === 0 ? 0 : d / max;

    if (max === min) {
    h = 0; // achromatic
    } else {
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }

        h /= 6;
    }
    h = Math.floor(h * 100);
    s = Math.floor(s * 100);
    v = Math.floor(v * 100);

    return {"hue": h, "saturation": s, "level": v};
}

function getMaxZindex(panel) {
    var zmax = 1;
    var target = "div.panel";
    if ( panel ) {
        target = target + "-" + panel;
    }
    $(target+" div.thing").each( function() {
        var zindex = $(this).css("z-index");
        if ( zindex ) {
            zindex = parseInt(zindex, 10);
            if ( !isNaN(zindex) && zindex > zmax && zindex < 999) { zmax = zindex; }
        }
    });
    console.log("zmax = ", zmax);
    if ( zmax >= 998 ) {
        zmax = 1;
    }
    return zmax;
}

function convertToModal(modalcontent, addok) {
    if ( typeof addok === "string" )
    {
        modalcontent = modalcontent + '<div class="modalbuttons"><button name="okay" id="modalokay" class="dialogbtn okay">' + addok + '</button></div>';
    } else {
        modalcontent = modalcontent + '<div class="modalbuttons"><button name="okay" id="modalokay" class="dialogbtn okay">Okay</button>';
        modalcontent = modalcontent + '<button name="cancel" id="modalcancel" class="dialogbtn cancel">Cancel</button></div>';
    }
    return modalcontent;
}

function createModal(modalid, modalcontent, modaltag, addok,  pos, responsefunction, loadfunction) {
    // var modalid = "modalid";

    // skip if this modal window is already up...
    if ( typeof modalWindows[modalid]!=="undefined" && modalWindows[modalid]>0 ) { 
        // console.log("modal suppressed: ", modalWindows);
        return; 
    }
    
    modalWindows[modalid] = 1;
    modalStatus = modalStatus + 1;
    // console.log("modalid= ", modalid, "modaltag= ", modaltag, " addok= ", addok, " pos= ", pos, " modalWindows= ", modalWindows, " modalStatus= ", modalStatus);
    
    var modaldata = modalcontent;
    var modalhook;
    
    var postype;
    if ( modaltag && typeof modaltag === "object" ) {
        modalhook = modaltag;
        postype = "relative";
    } else if ( modaltag && (typeof modaltag === "string") && typeof ($(modaltag)) === "object"  ) {
        // console.log("modaltag string: ", modaltag);
        modalhook = $(modaltag);
        if ( modaltag==="body" || modaltag==="document" || modaltag==="window" ) {
            postype = "absolute";
        } else {
            postype = "relative";
        }
    } else {
//        alert("default body");
        // console.log("modaltag body: ", modaltag);
        modalhook = $("body");
        postype = "absolute";
    }
    
    var styleinfo = "";
    if ( pos ) {
        
        // enable full style specification of specific attributes
        if ( pos.style ) {
            styleinfo = " style=\"" + pos.style + "\"";
        } else {
            if ( pos.position ) {
                postype = pos.position;
            }
            styleinfo = " style=\"position: " + postype + ";";
            if ( !isNaN(pos.left) && !isNaN(pos.top) ) {
                styleinfo += " left: " + pos.left + "px; top: " + pos.top + "px;";
            }
            if ( pos.width && pos.height ) {
                styleinfo += " width: " + pos.width + "px; height: " + pos.height + "px;";
            }
            if ( pos.border ) {
                styleinfo += " border: " + pos.border + ";";
            }
            if ( pos.background ) {
                styleinfo += " background: " + pos.background + ";";
            }
            if ( pos.color ) {
                styleinfo += " color: " + pos.color + ";";
            }
            if ( pos.zindex ) {
                styleinfo += " z-index: " + pos.zindex + ";";
            }
            styleinfo += "\"";
        }
    }
    
    modalcontent = "<div id='" + modalid +"' class='modalbox'" + styleinfo + ">" + modalcontent;
    if ( addok ) {
        modalcontent = convertToModal(modalcontent, addok);
    }
    modalcontent = modalcontent + "</div>";
    
    modalhook.prepend(modalcontent);
    
    // call post setup function if provided
    if ( loadfunction ) {
        loadfunction(modalhook, modaldata);
    }

    // invoke response to click
    if ( addok ) {
        $("#"+modalid).on("click",".dialogbtn", function(evt) {
            if ( responsefunction ) {
                responsefunction(this, modaldata);
            }
            closeModal(modalid);
        });
    } else {
        // body clicks turn of modals unless clicking on box itself
        // or if this is a popup window any click will close it
        $("body").off("click");
        $("body").on("click",function(evt) {
            if ( (evt.target.id === modalid && modalid!=="modalpopup") || modalid==="waitbox") {
                evt.stopPropagation();
                return;
            } else {
                if ( responsefunction ) {
                    responsefunction(evt.target, modaldata);
                }
                closeModal(modalid);
                $("body").off("click");
            }
        });
        
    }
    
}

function closeModal(modalid) {
    try {
        $("#"+modalid).remove();
    } catch(e) {}

    modalWindows[modalid] = 0;
    modalStatus = modalStatus - 1;
    if ( modalStatus < 0 ) { modalStatus = 0; }
}

function setupColors() {
    
   $("div.overlay.color >div.color").each( function() {
        var that = $(this);
        var defcolor = that.html();
        if ( !defcolor ) {
            defcolor = "#FFFFFF";
        }
        $(this).minicolors({
            position: "bottom left",
            defaultValue: defcolor,
            theme: 'default',
            change: function(hex) {
                try {
                    that.html(hex);
                    var aid = that.attr("aid");
                    that.css({"background-color": hex});
                    var huetag = $("#a-"+aid+"-hue");
                    var sattag = $("#a-"+aid+"-saturation");
                    if ( huetag.length ) { huetag.css({"background-color": hex}); }
                    if ( sattag.length ) { sattag.css({"background-color": hex}); }
                } catch(e) {}
            },
            hide: function() {
                var newcolor = $(this).minicolors("rgbObject");
                var hsl = rgb2hsv( newcolor.r, newcolor.g, newcolor.b );
                var hslstr = "hsl("+hsl.hue.pad(3)+","+hsl.saturation.pad(3)+","+hsl.level.pad(3)+")";
                var aid = that.attr("aid");
                var tile = '#t-'+aid;
                var bid = $(tile).attr("bid");
                var hubnum = $(tile).attr("hub");
                var thetype = $(tile).attr("type");
                var ajaxcall = "doaction";
                console.log(ajaxcall + ": id= "+bid+" type= "+ thetype+ " color= "+ hslstr);
                $.post(cm_Globals.returnURL, 
                       {useajax: ajaxcall, id: bid, type: thetype, value: hslstr, attr: "color", hubid: hubnum} );
            }
        });
    });   
}

function setupSliders() {
    
    $("div.overlay.level >div.level, div.overlay.volume >div.volume").slider({
        orientation: "horizontal",
        min: 0,
        max: 100,
        step: 5,
        stop: function( evt, ui) {
            var thing = $(evt.target);
            thing.attr("value",ui.value);
            
            var aid = thing.attr("aid");
            var tile = '#t-'+aid;
            var bid = $(tile).attr("bid");
            var hubnum = $(tile).attr("hub");
            var bidupd = bid;
            var ajaxcall = "doaction";
            var subid = thing.attr("subid");
            var thevalue = parseInt(ui.value);
            var thetype = $(tile).attr("type");
            
            var usertile = thing.siblings(".user_hidden");
            var command = "";
            var linktype = thetype;
            var linkval = "";
            if ( usertile && $(usertile).attr("command") ) {
                command = $(usertile).attr("command");    // command type
                if ( !thevalue ) {
                    thevalue = $(usertile).attr("value");      // raw user provided val
                }
                linkval = $(usertile).attr("linkval");    // urlencooded val
                linktype = $(usertile).attr("linktype");  // type of tile linked to
            }
            
            console.log(ajaxcall + ": id= "+bid+" type= "+linktype+ " value= " + thevalue + " subid= " + subid + " command= " + command + " linkval: ", linkval);
            
            // handle music volume different than lights
            var updwait = 100;
            if ( thetype === "music") {
                updwait = 1000;
            }

            $.post(cm_Globals.returnURL, 
                {useajax: ajaxcall, id: bid, type: linktype, value: thevalue, attr: "level", 
                 subid: subid, hubid: hubnum, command: command, linkval: linkval} );
        }
    });

    // set the initial slider values
    $("div.overlay.level >div.level, div.overlay.volume >div.volume").each( function(){
        var initval = $(this).attr("value");
        $(this).slider("value", initval);
    });

    // now set up all colorTemperature sliders
    $("div.overlay.colorTemperature >div.colorTemperature").slider({
        orientation: "horizontal",
        min: 2000,
        max: 7400,
        step: 200,
        stop: function( evt, ui) {
            var thing = $(evt.target);
            thing.attr("value",ui.value);
            
            var aid = thing.attr("aid");
            var tile = '#t-'+aid;
            var bid = $(tile).attr("bid");
            var hubnum = $(tile).attr("hub");
            var ajaxcall = "doaction";
            var subid = thing.attr("subid");
            var thevalue = parseInt(ui.value);
            var thetype = $(tile).attr("type");
            var usertile = thing.siblings(".user_hidden");
            var command = "";
            var linktype = thetype;
            var linkval = "";
            if ( usertile ) {
                command = $(usertile).attr("command");    // command type
                if ( !thevalue ) {
                    thevalue = $(usertile).attr("value");      // raw user provided val
                }
                linkval = $(usertile).attr("linkval");    // urlencooded val
                linktype = $(usertile).attr("linktype");  // type of tile linked to
            }
            
            console.log(ajaxcall + ": command= " + command + " id= "+bid+" type= "+linktype+ " value= " + thevalue + " subid= " + subid + " command= " + command + " linkval: ", linkval);
            
            $.post(cm_Globals.returnURL, 
                {useajax: ajaxcall, id: bid, type: thetype, value: parseInt(ui.value), 
                          attr: "colorTemperature", subid: subid, hubid: hubnum, command: command, linkval: linkval } );
        }
    });

    // set the initial slider values
    $("div.overlay.colorTemperature >div.colorTemperature").each( function(){
        var initval = $(this).attr("value");
        $(this).slider("value", initval);
    });
    
}

function cancelDraggable() {
    $("div.panel div.thing").each(function(){
        if ( $(this).draggable("instance") ) {
            $(this).draggable("destroy");
            
            // remove the position so color swatch stays on top
            if ( $(this).css("left")===0 || $(this).css("left")==="" ) {
                $(this).css("position","");
            }
        }
    });
    
    if ( $("div.panel").droppable("instance") ) {
        $("div.panel").droppable("destroy");
    }

    if ( $("#catalog").droppable("instance") ) {
        $("#catalog").droppable("destroy");
    }
    
    // remove the catalog
    $("#catalog").remove();
}

function cancelSortable() {
    $("div.panel").each(function(){
        if ( $(this).sortable("instance") ) {
            $(this).sortable("destroy");
        }
    });
    $("div.sortnum").each(function() {
       $(this).remove();
    });
}

function cancelPagemove() {
    if ( $("#roomtabs").sortable("instance") ) {
        $("#roomtabs").sortable("destroy");
    }
}

function setupPagemove() {
    
    // make the room tabs sortable
    // the change function does a post to make it permanent
    var ajaxcall = "pageorder";
    $("#roomtabs").sortable({
        axis: "x", 
        items: "> li",
        cancel: "li.nodrag",
        opacity: 0.5,
        containment: "ul.ui-tabs-nav",
        delay: 200,
        revert: false,
        update: function(evt, ui) {
            var pages = {};
            var k = 0;
            // get the new list of pages in order
            // fix nasty bug to correct room tab move
            $("#roomtabs >li.ui-tab").each(function() {
                var pagename = $(this).text();
                pages[pagename] = k;
                k++;
            });
            console.log("reordering " + k + " rooms: ", pages);
            $.post(cm_Globals.returnURL, 
                {useajax: ajaxcall, id: "none", type: "rooms", value: pages, attr: "none"},
                function (presult, pstatus) {
                    if (pstatus==="success" && typeof presult==="object" ) {
                        console.log( "pageorder" + ": POST returned: ", presult );
                    } else {
                        console.log( "pstatus: ", pstatus, " presult: ", presult);
                    }
                }, "json"
            );
        }
    });
}

function setupSortable() {
    
    // loop through each room panel
    reordered = false;
    $("div.panel").each( function() {
        var roomtitle = $(this).attr("title");
        
        // loop through each thing in this room and number it
        var num = 0;
        $("div.thing[panel="+roomtitle+"]").each(function(){
            num++;
            addSortNumber(this, num.toString());
        });
    });

    var ajaxcall = "pageorder";
    $("div.panel").sortable({
        containment: "parent",
        scroll: true,
        items: "> div",
        delay: 50,
        grid: [1, 1],
        stop: function(evt, ui) {
            var roomtitle = $(ui.item).attr("panel");
            var things = [];
            var num = 0;
            $("div.thing[panel="+roomtitle+"]").each(function(){
                // get tile name and number
                var tilename = $(this).find(".thingname").text();
                var tile = $(this).attr("tile");
                things.push([tile, tilename]);
                num++;
                
                // update the sorting numbers to show new order
                updateSortNumber(this, num.toString());
            });
            reordered = true;
            console.log("reordering " + num + " tiles: ", things);
            $.post(cm_Globals.returnURL, 
                {useajax: "pageorder", id: "none", type: "things", value: things, attr: roomtitle},
                function (presult, pstatus) {
                    if (pstatus==="success" && typeof presult==="object" ) {
                        console.log(ajaxcall + ": POST returned: ", presult );
                    } else {
                        console.log( "pstatus: ", pstatus, " presult: ", presult);
                    }
                }, "json"
            );
        }
    });
}

function addSortNumber(thetile, num) {
   var sortdiv = "<div class=\"sortnum\">" + num + "</div>";
   $(thetile).append(sortdiv);
}

function updateSortNumber(thetile, num) {
   $(thetile).children(".sortnum").html(num);
}

var startPos = {top: 0, left: 0, zindex: 0};
function thingDraggable(thing, snap) {
    var snapgrid = false;
    if ( snap ) {
        snapgrid = [10, 10];
    }
    thing.draggable({
        revert: "invalid",
        // containment: "#dragregion",
        start: function(evt, ui) {
            startPos.left = $(evt.target).css("left");
            startPos.top = $(evt.target).css("top");
            startPos.zindex = $(evt.target).css("z-index");
            
            // while dragging make sure we are on top
            $(evt.target).css("z-index", 999);
        },
        stop: function(evt, ui) {
            
            // fix invalid tiles
            if ( isNaN(startPos.zindex) || startPos.zindex > 998 ) {
                startPos.zindex = 2;
                $(evt.target).css( {"z-index": startPos.zindex.toString()} );
        }
        },
        grid: snapgrid
    });
}

function setupDraggable() {

    // get the catalog content and insert after main tabs content
    var hubpick = cm_Globals.hubId;
    var xhr = $.post(cm_Globals.returnURL, 
        {useajax: "getcatalog", id: 0, type: "catalog", value: "none", attr: hubpick},
        function (presult, pstatus) {
            if (pstatus==="success") {
                $("#tabs").after(presult);
            } else {
                console.log("error - ", pstatus);
            }
        }
    );
    
    // if we failed clean up
    xhr.fail( cancelDraggable );
    
    // enable filters and other stuff if successful
    xhr.done( function() {
        
        $("#catalog").draggable();
        
        setupFilters();

        // show the catalog
        $("#catalog").show();

        // the active things on a panel
        var snap = $("#mode_Snap").prop("checked");
        thingDraggable( $("div.panel div.thing"), snap );
    
        // enable dropping things from the catalog into panel
        // and movement of existing things around on the panel itself
        // use this instead of stop method to deal with cancelling drops
        $("div.panel").droppable({
            accept: function(thing) {
                var accepting = false;
                if ( thing.hasClass("thing") && modalStatus===0 ) {
                    accepting = true;
                }
                return accepting;
            },
            tolerance: "intersect",
            drop: function(evt, ui) {
                var thing = ui.draggable;
                var bid = $(thing).attr("bid");
                var tile = $(thing).attr("tile");
                var thingtype = $(thing).attr("type");
                var thingname = $(thing).find(".thingname").text();

                var pagex = evt.pageX;
                var pagey = evt.pageY;
                // var thingname = $("span.orignal.n_"+tile).html();

                // handle new tile creation
                if ( thing.hasClass("catalog-thing") ) {
                    // get panel of active page - have to do this the hard way
                    // because the thing in the catalog doesn't have a panel attr
                    $("li.ui-tabs-tab").each(function() {
                        if ( $(this).hasClass("ui-tabs-active") ) {
                            var clickid = $(this).attr("aria-labelledby");
                            var panel = $("#"+clickid).text();
                            var lastthing = $("div.panel-"+panel+" div.thing").last();
                            var pos = {left: pagex, top: pagey};
                            createModal("modaladd","Add: "+ thingname + " of Type: "+thingtype+" to Room: "+panel+"?<br />Are you sure?","body", true, pos, function(ui, content) {
                                var clk = $(ui).attr("name");
                                if ( clk==="okay" ) {
                                    // add it to the system
                                    // the ajax call must return a valid "div" block for the dragged new thing
                                    // get the last thing in the current room
                                    // var lastthing = $("div.panel-"+panel+" div.thing").last();
                                    // var cnt = $("div.panel div.thing").last().attr("id");
                                    // cnt = parseInt(cnt.substring(2),10) + 1;

                                    $.post(cm_Globals.returnURL, 
                                        {useajax: "dragmake", id: bid, type: thingtype, value: panel},
                                        function (presult, pstatus) {
                                            if (pstatus==="success" && !presult.startsWith("error")) {
                                                console.log( "Added " + thingname + " of type " + thingtype + " and bid= " + bid + " to room " + panel);
                                                lastthing.after(presult);
                                                var newthing = lastthing.next();
                                                var zmax = getMaxZindex(panel) + 1;
                                                // var zmax = 2;
                                                $(newthing).css( {"z-index": zmax.toString()} );
                                                var snap = $("#mode_Snap").prop("checked");
                                                thingDraggable( newthing, snap );
                                                setupPage();
                                                setupSliders();
                                                setupColors();
                                            } else {
                                                console.log("pstatus: ", pstatus, " presult: ", presult);
                                            }
                                        } 
                                    );
                                }
                            });
                        } 
                    });
                // otherwise this is an existing thing we are moving
                } else {
                    var dragthing = {};
                    dragthing["id"] = $(thing).attr("id");
                    dragthing["tile"] = tile;
                    dragthing["panel"] = $(thing).attr("panel");
                    var customname = $("div." + thingtype + ".name.p_"+tile).html();
                    if ( !customname ) { customname = thingname; }
                    dragthing["custom"] = customname;
                    
                    // make this sit on top
                    var zmax = getMaxZindex(dragthing["panel"]) + 1;
                    dragthing["zindex"] = zmax;
                    $(thing).css( {"z-index": zmax.toString()} );
                    // $(thing).attr("style", "left: "+ui.position.left+"px; top: "+ui.position.top+"px; z-index: "+zmax);
                    
                    // now post back to housepanel to save the position
                    // also send the dragthing object to get panel name and tile pid index
                    if ( ! $("#catalog").hasClass("ui-droppable-hover") ) {
                        console.log( "Moving " + customname + " to top: "+ ui.position.top + ", left: " + ui.position.left + ", z-index: " + zmax);
                        $.post(cm_Globals.returnURL, 
                               {useajax: "dragdrop", id: bid, type: thingtype, value: dragthing, attr: ui.position},
                            function (presult, pstatus) {
                                if (pstatus==="success" ) {
                                    console.log("success - result: ", presult," position: ", ui.position );
                                } else {
                                    console.log("pstatus: ", pstatus, " presult: ", presult," position: ", ui.position );
                                }
                            }
                        );
                    }

                }
            }
        });

        // enable dragging things from catalog
        $("#catalog div.thing").draggable({
            revert: false,
            // containment: "#dragregion",
            helper: "clone"
        });

        // enable dropping things from panel into catalog to remove
        $("#catalog").droppable({
            accept: "div.panel div.thing",
            tolerance: "fit",
            drop: function(evt, ui) {
                var thing = ui.draggable;
                var bid = $(thing).attr("bid");
                var thingtype = $(thing).attr("type");
                // easy to get panel of active things
                var panel = $(thing).attr("panel");
                var id = $(thing).attr("id");
                var tile = $(thing).attr("tile");
                // var tilename = $("#s-"+aid).text();
                // var tilename = $("span.original.n_"+tile).html();
                var tilename = $(thing).find(".thingname").text();
                var pos = {top: 100, left: 10};

                createModal("modaladd","Remove: "+ tilename + " of type: "+thingtype+" from room "+panel+"? Are you sure?", "body" , true, pos, function(ui, content) {
                    var clk = $(ui).attr("name");
                    if ( clk==="okay" ) {
                        $.post(cm_Globals.returnURL, 
                            {useajax: "dragdelete", id: bid, type: thingtype, value: panel, attr: tile},
                            function (presult, pstatus) {
                                if (pstatus==="success" && !presult.startsWith("error")) {
                                    console.log( "Removed tile #" + tile + " name: " + tilename);
                                    $(thing).remove();
                                } else {
                                    console.log("pstatus: ", pstatus, " presult: ", presult);
                                }
                            }
                        );

                    // even though we did a successful drop, revert to original place
                    } else {
                        // $("#"+id).data('draggable').options.revert();
                        try {
                            $(thing).css("position","relative").css("left",startPos.left).css("top",startPos.top);
                            $(thing).css( {"z-index": startPos.zindex.toString()} );
                        } catch(e) { 
                            console.log("Drag/drop error. Please share this with @kewashi on the ST or HE Community Forum: ", e); 
                        }
                    }
                });
            }
        });
    
    });
}

// make the post call back to main server
function dynoPost(ajaxcall, body, id, type, value, attr, reload, callback) {
    var isreload;
    var delay = 1000;

    // if body is not given or is not an object then use all other values
    // to set the object to pass to post call with last one being a reload flag
    if ( typeof body !== "object" ) { 
        id = typeof id!=="undefined" ? id : "0";
        type = typeof type!=="undefined" ? type : "none";
        value = typeof value!=="undefined" ? value : "none";
        attr = typeof attr!=="undefined" ? attr : "none";
        isreload = typeof reload!=="undefined" ? reload : false;
        body = {api: ajaxcall, id: id, type: type, value: value, attr: attr};

    // if a body object is given then next parameter is treated as a reload flag
    // and everything after that is ignored
    } else {
        body["api"] = ajaxcall;
        if ( typeof id === "undefined" ) {
            isreload = false;
            callback = false;
        } else {
            isreload = id;
            if ( typeof type !== "undefined" && !isNaN(parseInt(type)) ) {
                delay = parseInt(type);
            }
        }
        isreload = typeof id!=="undefined" ? id : false;
    }

    if ( callback && typeof callback==="function" ) {
        $.post(cm_Globals.returnURL, body, callback);

    } else {
        $.post(cm_Globals.returnURL, body,
            function (presult, pstatus) {
                if ( isreload && pstatus==="success" ) {

                    // window.location.href = cm_Globals.returnURL;
                    // don't reload right away... wait one second
                    setTimeout( function() {
                        window.location.href = cm_Globals.returnURL;
                    }, delay);

                } else {
                    console.log("dyno POST: ", pstatus, " body: ", body, " presult: ", presult);

                    // clear blinking interval if requested
                    if ( typeof type!=="undefined" && type==="::blink::" & typeof value!=="undefined" ) {
                        clearInterval(value);
                    }
                }
            }
        );
    }
}

function execButton(buttonid) {

    if ( buttonid==="optSave") {
        // first save our filters
        if ( !checkInputs() ) { return; }

        var fobj = formToObject("filteroptions");
        dynoPost("filteroptions", fobj);

        // save our username and password info
        // this is in the tsk function
        var uobj = formToObject("userpw");
        dynoPost("saveuserpw", uobj);

        // next save our form - this is done asynchronously
        // when done the server will push a signal to clients to reload
        var obj = formToObject("optionspage");
        dynoPost("saveoptions", obj, true);
        // pause 2 seconds to let save take hold then reload
        // the callback doesn't seem to work
        // setTimeout( function() {
        //     window.location.href = cm_Globals.returnURL;
        // }, 2000);
        // window.location.href = cm_Globals.returnURL;

    } else if ( buttonid==="optCancel" ) {
        // do nothing but reload the main page
        window.location.href = cm_Globals.returnURL;

    } else if ( buttonid==="optReset" ) {
        // reset the forms on the options page to their starting values
        $("#optionspage")[0].reset();
        $("#filteroptions")[0].reset();

    } else if ( buttonid==="dologin") {
        var genobj = formToObject("loginform");
        dynoPost("dologin", genobj, true);

    } else if ( buttonid === "blackout") {
        // blank out screen with a black box size of the window and pause timers
        var w = window.innerWidth;
        var h = window.innerHeight;            
        priorOpmode = "Sleep";
        $("div.maintable").after("<div id=\"blankme\"></div>");
        $("#blankme").css( {"height":h+"px", "width":w+"px", 
                            "position":"absolute", "background-color":"black",
                            "left":"0px", "top":"0px", "z-index":"9999" } );

        // clicking anywhere will restore the window to normal
        $("#blankme").on("click", function(evt) {
            $("#blankme").remove(); 
            priorOpmode = "Operate";
            evt.stopPropagation();
        });
    } else if ( buttonid === "toggletabs") {
        toggleTabs();
    } else if ( buttonid === "reorder" ) {
        if ( priorOpmode === "DragDrop" ) {
            updateFilters();
            cancelDraggable();
            delEditLink();
        }
        setupSortable();
        setupPagemove();
        $("#mode_Reorder").prop("checked",true);
        priorOpmode = "Reorder";
    } else if ( buttonid === "edit" ) {
        if ( priorOpmode === "Reorder" ) {
            cancelSortable();
            cancelPagemove();
        }
        setupDraggable();
        setupPagemove();
        addEditLink();
        $("#mode_Edit").prop("checked",true);
        priorOpmode = "DragDrop";
    } else if ( buttonid==="showdoc" ) {
        window.open("http://www.housepanel.net",'_blank');
        return;
    // } else if ( buttonid==="name" ) {
    //     return;
    } else if ( buttonid==="operate" ) {
        if ( priorOpmode === "Reorder" ) {
            cancelSortable();
            cancelPagemove();
            if ( reordered ) {
                window.location.href = cm_Globals.returnURL;
            }
        } else if ( priorOpmode === "DragDrop" ) {
            updateFilters();
            cancelDraggable();
            delEditLink();
        }
        $("#mode_Operate").prop("checked",true);
        priorOpmode = "Operate";
    } else if ( buttonid==="snap" ) {
        var snap = $("#mode_Snap").prop("checked");
        console.log("snap mode: ",snap);

    } else if ( buttonid==="refresh" ) {
        var pstyle = "position: absolute; background-color: red; color: white; font-weight: bold; font-size: 32px; left: 400px; top: 300px; width: 400px; height: 200px; margin-top: 50px;";
        createModal("info", "Screen will refresh in<br/>10 seconds...","body", false, {style: pstyle});
        dynoPost(buttonid);

    } else if ( buttonid==="refactor" ) {
        alert("This feature is not yet available.");
        // dynoPost(buttonid);

    // default is to call main node app with the id as a path
    } else {
        window.location.href = cm_Globals.returnURL + "/" + buttonid;
    }
}

function updateFilters() {
    var fobj = formToObject("filteroptions");
    dynoPost("filteroptions", fobj);
}

function checkInputs() {

    var port = $("input[name='port']").val().trim();
    var webSocketServerPort = $("input[name='webSocketServerPort']").val().trim();
    // var fast_timer = $("input[name='fast_timer']").val();
    var slow_timer = $("input[name='slow_timer']").val().trim();
    var uname = $("input[name='uname']").val().trim();
    var pword = $("input[name='pword']").val().trim();

    var errs = {};
    var isgood = true;
    var intre = /^\d{1,}$/;         // only digits allowed and must be more than 1024
    var unamere = /^\D\S{3,}$/;      // start with a letter and be four long at least
    var pwordre = /^\S{6,}$/;        // start with anything but no white space and at least 6 digits 

    if ( port ) {
        var i = parseInt(port, 10);
        if ( !intre.test(port) || (i > 0 && i < 1024) || i > 65535 ) {
            errs.port = " " + port + ", Must be 0 or an integer between 1024 and 65535";
            isgood = false;
        }
    }
    if ( webSocketServerPort ) {
        var j = parseInt(webSocketServerPort, 10);
        if ( !intre.test(webSocketServerPort)  || (j > 0 && j < 1024) || j > 65535 ) {
            errs.webSocketServerPort = " " + webSocketServerPort + ", Must be 0 or an integer between 1024 and 65535";
            isgood = false;
        }
    }

    // if ( !intre.test(fast_timer) ) {
    //     errs.fast_timer = " " + fast_timer + ", must be an integer; enter 0 to disable";
    //     isgood = false;
    // }
    if ( !intre.test(slow_timer) ) {
        errs.slow_timer = " " + slow_timer + ", must be an integer; enter 0 to disable";
        isgood = false;
    }
    if ( uname!=="admin" && uname!=="default" && !unamere.test(uname) ) {
        errs.uname = " " + uname + ", must begin with a letter and be at least 3 characters long";
        isgood = false;
    }
    if ( pword!=="" && !pwordre.test(pword) ) {
        errs.pword = ", must be blank or at least 6 characters long";
        isgood = false;
    }

    // show all errors
    if ( !isgood ) {
        var str = "";
        $.each(errs, function(key, val) {
            str = str + "Invalid " + key + val + "\n"; 
        });
        alert(str);
    }
    return isgood;
}

function setupButtons() {

    if ( $("div.formbutton") ) {
        $("div.formbutton").on('click', function(evt) {
            var buttonid = $(this).attr("id");
            var textname = $(this).text();

            // do nothing for name field
            if ( textname === "name" ) {
                return;
            }

            if ( $(this).hasClass("confirm") ) {
                var pos = {top: 100, left: 100};
                createModal("modalexec","Perform " + textname + " operation... Are you sure?", "body", true, pos, function(ui, content) {
                    var clk = $(ui).attr("name");
                    if ( clk==="okay" ) {
                        execButton(buttonid);
                        evt.stopPropagation();
                    }
                });
            } else {
                execButton(buttonid);
                evt.stopPropagation();
            }
        });
    }
        
    $("button.infobutton").on('click', function() {
        window.location.href = cm_Globals.returnURL;
    });

    if ( pagename==="main" && !disablebtn ) {

        $("div.modeoptions").on("click","input.radioopts",function(evt){
            var opmode = $(this).attr("value");
            execButton(opmode);
            evt.stopPropagation();
        });
        
        $("#infoname").on("click", function(e) {
            var username = $(this).html();
            var pos = {top: 40, left: 820};
            createModal("modalexec","Log out user "+ username + " <br/>Are you sure?", "body" , true, pos, function(ui, content) {
                var clk = $(ui).attr("name");
                if ( clk==="okay" ) {
                    window.location.href = cm_Globals.returnURL + "/logout";
                } else {
                    closeModal("modalexec");
                }
            });
        });

    } else if ( pagename==="info" ) {
        
        $("button.showhistory").on('click', function() {
            if ( $("#devhistory").hasClass("hidden") ) {
                $("#devhistory").removeClass("hidden");
                $(this).html("Hide Dev Log");
            } else {
                $("#devhistory").addClass("hidden");
                $(this).html("Show Dev Log");
            }
        });

    } else if ( pagename==="auth" ) {

        $("#pickhub").on('change',function(evt) {
            var hubId = $(this).val();
            var target = "#authhub_" + hubId;
            
            // this is only the starting type and all we care about is New
            // if we needed the actual type we would have used commented code
            var hubType = $(target).attr("hubtype");
            // var realhubType = $("#hubdiv_" + hubId).children("select").val();
            // alert("realhubType= " + realhubType);
            if ( hubType==="New" ) {
                $("input.hubdel").addClass("hidden");
                $("#newthingcount").html("Fill out the fields below to add a New hub");
            } else {
                $("input.hubdel").removeClass("hidden");
                $("#newthingcount").html("");
            }
            $("div.authhub").each(function() {
                if ( !$(this).hasClass("hidden") ) {
                    $(this).addClass("hidden");
                }
            });
            $(target).removeClass("hidden");
            evt.stopPropagation(); 
        });
        
        // this clears out the message window
        $("div.greetingopts").on('click',function(evt) {
            $("#newthingcount").html("");
        });
        
        // handle auth submissions
        // add on one time info from user
        $("input.hubauth").click(function(evt) {
            try {
                var hubId = $(this).attr("hubid");
                var formData = formToObject("hubform_"+hubId);
            } catch(err) {
                evt.stopPropagation(); 
                alert("Something went wrong when trying to authenticate your hub...\n" + err.message);
                console.log("Error: ", err);
                return;
            }
            
            // make an api call and process results
            // some hubs return devices on server and pushes results later
            // others return a request to start an OATH redirection flow
            formData["api"] = "hubauth";
            $.post(cm_Globals.returnURL, formData,  function(presult, pstatus) {
                console.log("dynoPost hubauth: ", presult);

                if ( pstatus==="success" && typeof presult==="object") {
                    var obj = presult;
                    if ( obj.action === "things" ) {
                        // tell user we are authorizing hub...
                        $("#newthingcount").html("Authorizing " + obj.hubType + " hub: " + obj.hubName).fadeTo(400, 0.1 ).fadeTo(400, 1.0);
                        var blinkauth = setInterval(function() {
                            $("#newthingcount").fadeTo(400, 0.1 ).fadeTo(400, 1);
                        }, 1000);

                    }

                    // if oauth flow then start the process
                    else if ( obj.action === "oauth" ) {
                        $("#newthingcount").html("Redirecting to OAUTH page");
                        var nvpreq= "response_type=code&client_id=" + encodeURI(obj.clientId) + "&scope=app&redirect_uri=" + encodeURI(obj.url);
                        var location = obj.host + "/oauth/authorize?" + nvpreq;
                        window.location.href = location;
                    }
                }
            });
        });

        // send user to options page if first time
        // user is done authorizing so make an API call to clean up
        // and then return to the main app
        $("#cancelauth").click(function(evt) {
            window.location.href = cm_Globals.returnURL + "/showoptions";
            // $.post(cm_Globals.returnURL, 
            //     {useajax: "cancelauth", id: "", type: "none"},
            //     function (presult, pstatus) {
            //         if (pstatus==="success") {
            //             window.location.href = cm_Globals.returnURL + "/showoptions";
            //         } else {
            //             window.location.href = cm_Globals.returnURL;
            //         }
            //     }
            // );
            evt.stopPropagation(); 
        });
        
        // TODO - test and activate this feature
        $("input.hubdel").click(function(evt) {
            var hubnum = $(this).attr("hub");
            var hubId = $(this).attr("hubid");
            var bodytag = "body";
            var pos = {position: "absolute", top: 600, left: 150, 
                       width: 600, height: 60, border: "4px solid"};
            // alert("Remove request for hub: " + hubnum + " hubID: " + hubId );

            createModal("modalhub","Remove hub #" + hubnum + " hubID: " + hubId + "? Are you sure?", bodytag , true, pos, function(ui, content) {
                var clk = $(ui).attr("name");
                if ( clk==="okay" ) {
                    // remove it from the system
                    $.post(cm_Globals.returnURL, 
                        {useajax: "hubdelete", id: hubId, type: "none", value: "none"},
                        function (presult, pstatus) {
                            if (pstatus==="success" && !presult.startsWith("error")) {
                                getOptions();
                                // now lets fix up the auth page by removing the hub section
                                var target = "#authhub_" + hubId;
                                $(target).remove();
                                $("#pickhub > option[value='" + hubId +"']").remove();
                                $("div.authhub").first().removeClass("hidden");
                                $("#pickhub").children().first().prop("selected", true);

                                // inform user what just happened
                                var ntc = "Removed hub#" + hubnum + " hubID: " + hubId;
                                if ( $("#newthingcount") ) {
                                    $("#newthingcount").html(ntc);
                                }
                                console.log( ntc );
                                
                                // send message over to Node.js to update elements
                                wsSocketSend("update");
                            } else {
                                if ( $("#newthingcount") ) {
                                    $("#newthingcount").html(presult);
                                }
                                console.log(presult);
                            }
                        }
                    );
                }
            });
            
            evt.stopPropagation(); 
        });
    
    }

}

function addEditLink() {
    
    // add links to edit and delete this tile
    $("div.panel > div.thing").each(function() {
        var editdiv = "<div class=\"editlink\" aid=" + $(this).attr("id") + "> </div>";
        var cmzdiv = "<div class=\"cmzlink\" aid=" + $(this).attr("id") + "> </div>";
        var deldiv = "<div class=\"dellink\" aid=" + $(this).attr("id") + "> </div>";
        $(this).append(cmzdiv).append(editdiv).append(deldiv);
    });
    
    // add links to edit page tabs
    $("#roomtabs li.ui-tab").each(function() {
        var roomname = $(this).children("a").text();
        var editdiv = "<div class=\"editpage\" roomnum=" + $(this).attr("roomnum") + " roomname=\""+roomname+"\"> </div>";
        var deldiv = "<div class=\"delpage\" roomnum=" + $(this).attr("roomnum") + " roomname=\""+roomname+"\"> </div>";
        $(this).append(editdiv).append(deldiv);
    })
    
    // add link to add a new page
    var editdiv = "<div id=\"addpage\" class=\"addpage\" roomnum=\"new\">Add</div>";
    $("#roomtabs").append(editdiv);
    
    $("div.editlink").on("click",function(evt) {
        var aid = $(evt.target).attr("aid");
        var thing = "#" + aid;
        var str_type = $(thing).attr("type");
        var tile = $(thing).attr("tile");
        var strhtml = $(thing).html();
        var thingclass = $(thing).attr("class");
        var bid = $(thing).attr("bid");
        var hubnum = $(thing).attr("hub");
        var hub = getHub(hubnum);
        var hubName = "None";
        var hubType = "SmartThings";
        if ( hub ) {
            hubName = hub.hubName;
            hubType = hub.hubType;
        }

        // replace all the id tags to avoid dynamic updates
        strhtml = strhtml.replace(/ id="/g, " id=\"x_");
        editTile(str_type, tile, aid, bid, thingclass, hubnum, hubName, hubType, strhtml);
    });
    
    $("div.cmzlink").on("click",function(evt) {
        var aid = $(evt.target).attr("aid");
        var thing = "#" + aid;
        var thingname = $(thing).attr("name");
        var pwsib = $(evt.target).siblings("div.overlay.password");
        if ( pwsib && pwsib.length > 0 ) {
            pw = pwsib.children("div.password").html();
            checkPassword(thing, "Tile editing", pw, runCustom);
        } else {
            runCustom(thing," ");
        }
        function runCustom(thing, name) {
            var str_type = $(thing).attr("type");
            var tile = $(thing).attr("tile");
            var bid = $(thing).attr("bid");
            var hubnum = $(thing).attr("hub");
            customizeTile(tile, aid, bid, str_type, hubnum);
        }
        // customizeTile(tile, aid, bid, str_type, hubnum);
    });
    
    $("div.dellink").on("click",function(evt) {
        var thing = "#" + $(evt.target).attr("aid");
        var str_type = $(thing).attr("type");
        var tile = $(thing).attr("tile");
        var bid = $(thing).attr("bid");
        var panel = $(thing).attr("panel");
        var hubnum = $(thing).attr("hub");
        var tilename = $(thing).find(".thingname").text();
        var offset = $(thing).offset();
        var thigh = $(thing).height();
        var twide = $(thing).width();
        var tleft = offset.left - 600 + twide;
        if ( tleft < 10 ) { tleft = 10; }
        var pos = {top: offset.top + thigh, left: tleft, width: 600, height: 80};

        createModal("modaladd","Remove: "+ tilename + " of type: "+str_type+" from hub Id: " + hubnum + " & room "+panel+"?<br>Are you sure?", "body" , true, pos, function(ui, content) {
            var clk = $(ui).attr("name");
            if ( clk==="okay" ) {
                $.post(cm_Globals.returnURL, 
                    {useajax: "dragdelete", id: bid, type: str_type, value: panel, attr: tile},
                    function (presult, pstatus) {
                        if (pstatus==="success" && !presult.startsWith("error")) {
                            console.log("Removed tile #" + tile + " name: " + tilename);
                            $(thing).remove();
                            getOptions();
                        } else {
                            console.log("pstatus: ", pstatus, " presult: ", presult);
                        }
                    }
                );
            }
        });
        
    });
    
    $("#roomtabs div.delpage").off("click");
    $("#roomtabs div.delpage").on("click",function(evt) {
        var roomnum = $(evt.target).attr("roomnum");
        var roomname = $(evt.target).attr("roomname");
        var clickid = $(evt.target).parent().attr("aria-labelledby");
        var pos = {top: 100, left: 10};
        createModal("modaladd","Remove Room #" + roomnum + " with Name: " + roomname +" from HousePanel. Are you sure?", "body" , true, pos, function(ui, content) {
            var clk = $(ui).attr("name");
            if ( clk==="okay" ) {
                // remove it from the system
                // alert("Removing thing = " + tilename);
                $.post(cm_Globals.returnURL, 
                    {useajax: "pagedelete", id: roomnum, type: "none", value: roomname, attr: "none"},
                    function (presult, pstatus) {
                        if (pstatus==="success" && !presult.startsWith("error")) {
                            console.log( "Removed Page #" + roomnum + " Page name: "+ roomname );
                            // remove it visually
                            $("li[roomnum="+roomnum+"]").remove();
                            getOptions();
                            
                            // fix default tab if it is on our deleted page
                            var defaultTab = getCookie( 'defaultTab' );
                            if ( defaultTab === clickid ) {
                                defaultTab = $("#roomtabs").children().first().attr("aria-labelledby");
                                setCookie('defaultTab', defaultTab, 30);
                            }
                        } else {
                            console.log(presult);
                        }
                    }
                );
            }
        });
        
    });
    
    $("#roomtabs div.editpage").off("click");
    $("#roomtabs div.editpage").on("click",function(evt) {
        var roomnum = $(evt.target).attr("roomnum");
        var roomname = $(evt.target).attr("roomname");
        editTile("page", roomname, 0, 0, "", roomnum, "None", "None");
    });
   
    $("#addpage").off("click");
    $("#addpage").on("click",function(evt) {
        var clickid = $(evt.target).attr("aria-labelledby");
        var pos = {top: 100, left: 10};
        createModal("modaladd","Add New Room to HousePanel. Are you sure?", "body" , true, pos, function(ui, content) {
            var clk = $(ui).attr("name");
            if ( clk==="okay" ) {
                $.post(cm_Globals.returnURL, 
                    {useajax: "pageadd", id: "none", type: "none", value: "none", attr: "none"},
                    function (presult, pstatus) {
                        if ( pstatus==="success" && !presult.startsWith("error") ) {
                            window.location.href = cm_Globals.returnURL;
                        } else {
                            console.log(presult);
                        }
                    }
                );
            }
        });
        
    });    
    
}

function delEditLink() {
//    $("div.editlink").off("click");
    $("div.editlink").each(function() {
       $(this).remove();
    });
    $("div.cmzlink").each(function() {
       $(this).remove();
    });
    $("div.dellink").each(function() {
       $(this).remove();
    });
    $("div.editpage").each(function() {
       $(this).remove();
    });
    $("div.delpage").each(function() {
       $(this).remove();
    });
    $("div.addpage").each(function() {
       $(this).remove();
    });
    // hide the skin and 
    // $("div.skinoption").hide();
    
    // closeModal();
}

function showType(ischecked, theval) {
    
    var hubpick = cm_Globals.hubId;
        
    if ( pagename==="options" ) {
        $('table.roomoptions tr[type="'+theval+'"]').each(function() {
            var hubId = $(this).children("td.hubname").attr("hubid");
            if ( ischecked && (hubpick===hubId || hubpick==="all") ) {
                $(this).attr("class", "showrow");
            } else {
                $(this).attr("class", "hiderow");
           }
        });

        var rowcnt = 0;
        $('table.roomoptions tr').each(function() {
            var odd = "";
            var theclass = $(this).attr("class");
            if ( theclass !== "hiderow" ) {
                rowcnt++;
                rowcnt % 2 === 0 ? odd = " odd" : odd = "";
                $(this).attr("class", "showrow"+odd);
            }
        });
    }
    
    // handle main screen catalog
    if ( $("#catalog") ) {
        $("#catalog div.thing[type=\""+theval+"\"]").each(function(){
            // alert( $(this).attr("class"));
            var hubId = $(this).attr("hubid");
            if ( ischecked && (hubpick===hubId || hubpick==="all") && $(this).hasClass("hidden") ) {
                $(this).removeClass("hidden");
            } else if ( (!ischecked || (hubpick!==hubId && hubpick!=="all")) && ! $(this).hasClass("hidden") ) {
                $(this).addClass("hidden");
            }
        });
    }
}

function setupFilters() {
    
//    alert("Setting up filters");
   // set up option box clicks
    function updateClick() {
        var theval = $(this).val();
        var ischecked = $(this).prop("checked");
        showType(ischecked, theval);
    }

    // initial page load set up all rows
    $('input[name="useroptions[]"]').each(updateClick);
    
    // upon click update the right rows
    $('input[name="useroptions[]"]').click(updateClick);

    // hub specific filter
    $('input[name="huboptpick"]').click(function() {
        // get the id of the hub type we just picked
        cm_Globals.hubId = $(this).val();

        // reset all filters using hub setting
        $('input[name="useroptions[]"]').each(updateClick);
    });

    $("div#thingfilters").click(function() {
        var filter = $("#filterup");
        // console.log( "filter: ", filter.html() );
        if ( filter.hasClass("hidden") ) {
            $(filter).removeClass("hidden");
            $("#catalog div.scrollvtable").removeClass("ftall");
            $("#catalog div.scrollvtable").addClass("fshort");
        } else {
            $(filter).addClass("hidden");
            $("#catalog div.scrollvtable").removeClass("fshort");
            $("#catalog div.scrollvtable").addClass("ftall");
        }
    });
    
    $("#allid").click(function() {
        $('input[name="useroptions[]"]').each(function() {
            $(this).prop("checked",true);
            $(this).attr("checked",true);
        });
        
        // update the main table using standard logic
        $('input[name="useroptions[]"]').each(updateClick);
    });
    
    $("#noneid").click(function() {
        $('input[name="useroptions[]"]').each(function() {
            $(this).prop("checked",false);
            $(this).attr("checked",false);
        });
        
        // update the main table using standard logic
        $('input[name="useroptions[]"]').each(updateClick);
    });
}

function setupCustomCount() {

    // use clock to get hubstr and rooms arrays
    var hubstr = $("tr[type='clock']:first td:eq(1)").html();
    var tdrooms = $("tr[type='clock']:first input");
    
    // this creates a new row
    function createRow(tilenum, k, tiletype) {
        var row = '<tr type="' + tiletype + '" tile="' + tilenum + '" class="showrow">';
        // var kstr = (k < 10) ? k : k;
        row+= '<td class="thingname">' + tiletype + k + '<span class="typeopt"> (' + tiletype + ')</span></td>';
        row+= '<td>' + hubstr + '</td>';

        tdrooms.each( function() {
            var theroom = $(this).attr("name");
            row+= '<td>';
            row+= '<input type="checkbox" name="' + theroom + '" value="' + tilenum + '" >';
            row+= '</td>';
        });
        row+= '</tr>';
        return row;
    }
    
    $("div.filteroption input.specialtile").on("change", function() {
        var sid = $(this).attr("id");
        var stype = sid.substring(4);
        var customtag = $("table.roomoptions tr[type='" + stype + "']");
        var currentcnt = customtag.size();
        var newcnt = parseInt($(this).val());
        // console.log("Id= ", sid," Type= ", stype, " Current count= ", currentcnt, " New count= ", newcnt);
        
        var customs = [];
        $("table.roomoptions tr[type='" + stype +"']").each( function() {
            customs.push($(this));
        });
        
        // get biggest id number
        var maxid = 0;
        $("table.roomoptions tr").each( function() {
            var tileid = parseInt($(this).attr("tile"));
            maxid = ( tileid > maxid ) ? tileid : maxid;
        });
        maxid++;
        // console.log("Biggest id number= ", maxid);
        
        // turn on the custom check box
        var custombox = $("input[name='useroptions[]'][value='" + stype + "']");
        if ( custombox ) {
            custombox.prop("checked",true);
            custombox.attr("checked",true);
        };
        
        // show the items of this type
        showType(true, stype);
        
        // remove excess if we are going down
        if ( newcnt>0 && newcnt < currentcnt ) {
            for ( var j= newcnt; j < currentcnt; j++ ) {
                // alert("j = "+j+" custom = " + customs[j].attr("type") );
                customs[j].detach();
            }
        }
        
        // add new rows
        if ( newcnt > currentcnt ) {
            var baseline = $("table.roomoptions tr[type='clock']").last();
            for ( var k= currentcnt; k < newcnt; k++ ) {
                var newrow = createRow(maxid, k+1, stype);
                customs[k] = $(newrow);
                if ( k > 0 ) {
                    baseline = customs[k-1];
                }
                baseline.after(customs[k]);
                if ( !baseline.hasClass("odd") ) {
                    customs[k].addClass("odd");
                }
                maxid++;
            }
        }
        
        // set current count
        currentcnt = newcnt;
    });
}

function toggleTabs() {
    var hidestatus = $("#toggletabs");
    if ( $("#roomtabs").hasClass("hidden") ) {
        $("#showversion").removeClass("hidden");
        $("#roomtabs").removeClass("hidden");
        if ( hidestatus ) hidestatus.html("Hide Tabs");
    } else {
        $("#showversion").addClass("hidden");
        $("#roomtabs").addClass("hidden");
        if ( hidestatus ) hidestatus.html("Show Tabs");
    }
}

function fixTrack(tval) {
    if ( !tval || tval.trim() === "" ) {
        tval = "None"; 
    } 
    else if ( tval.length > 124) { 
        tval = tval.substring(0,120) + " ..."; 
    }
    return tval;
}

// update all the subitems of any given specific tile
// note that some sub-items can update the values of other subitems
// this is exactly what happens in music tiles when you hit next and prev song
function updateTile(aid, presult) {

    // do something for each tile item returned by ajax call
    var isclock = false;
    var nativeimg = false;
    var oldvalue = "";
    
    // handle audio devices
    if ( presult["audioTrackData"] ) {
        if ( $("#a-"+aid+"-trackDescription") ) {
            oldvalue = $("#a-"+aid+"-trackDescription").html();
        }
        var audiodata = JSON.parse(presult["audioTrackData"]);
        presult["trackDescription"] = audiodata["title"] || "None";
        presult["currentArtist"] = audiodata["artist"];
        presult["currentAlbum"] = audiodata["album"];
        presult["trackImage"] = audiodata["albumArtUrl"];
        presult["mediaSource"] = audiodata["mediaSource"];
        delete presult["audioTrackData"];
        // console.log("audio track changed from: ["+oldvalue+"] to: ["+ presult["trackDescription"] +"]");
    }
    
    // handle native track images - including audio devices above
    if ( presult["trackImage"] ) {
        var trackImage = presult["trackImage"].trim();
        if ( trackImage.startsWith("http") ) {
            presult["trackImage"] = "<img height=\"120\" width=\"120\" src=\"" + trackImage + "\">";
            nativeimg = true;
        }
    }
    
    $.each( presult, function( key, value ) {
        var targetid = '#a-'+aid+'-'+key;

        // only take action if this key is found in this tile
        if ($(targetid)) {
            var oldvalue = $(targetid).html();
            var oldclass = $(targetid).attr("class");

        //    if ( key==="level") {
        //        alert(" aid="+aid+" key="+key+" targetid="+targetid+" value="+value+" oldvalue="+oldvalue+" oldclass= "+oldclass);
        //    }

            // remove the old class type and replace it if they are both
            // single word text fields like open/closed/on/off
            // this avoids putting names of songs into classes
            // also only do this if the old class was there in the first place
            // also handle special case of battery and music elements
            if ( key==="battery") {
                var powmod = parseInt(value);
                powmod = powmod - (powmod % 10);
                value = "<div style=\"width: " + powmod.toString() + "%\" class=\"ovbLevel L" + powmod.toString() + "\"></div>";
            // handle weather icons
            // updated to address new integer indexing method in ST
            } else if ( key==="weatherIcon" || key==="forecastIcon") {
                var icondigit = parseInt(value,10);
                var iconimg;
                if ( Number.isNaN(icondigit) ) {
                    iconimg = value;
                } else {
                    var iconstr = icondigit.toString();
                    if ( icondigit < 10 ) {
                        iconstr = "0" + iconstr;
                    }
                    iconimg = "media/weather/" + iconstr + ".png";
                }
                value = "<img src=\"" + iconimg + "\" alt=\"" + iconstr + "\" width=\"80\" height=\"80\">";
            } else if ( (key === "level" || key === "colorTemperature" || key==="volume" || key==="groupVolume") && $(targetid).slider ) {
                $(targetid).slider("value", value);
                // disable putting values in the slot
                value = false;
                oldvalue = false;
            // TODO: make color values work by setting the mini colors circle
            } else if ( key==="color") {
//                alert("updating color: "+value);
                $(targetid).html(value);
//                setupColors();
            // special case for numbers for KuKu Harmony things
            } else if ( key.startsWith("_number_") && value.startsWith("number_") ) {
                value = value.substring(7);
            } else if ( key === "skin" && value.startsWith("CoolClock") ) {
                value = '<canvas id="clock_' + aid + '" class="' + value + '"></canvas>';
                isclock = ( oldvalue !== value );
            // handle updating album art info
            } else if ( key === "trackDescription" && !nativeimg) {
                var forceit = false;
                if ( !oldvalue ) { 
                    oldvalue = "None" ;
                    forceit = true;
                } else {
                    oldvalue = oldvalue.trim();
                }
                // this is the same as fixTrack in php code
                if ( !value || value==="None" || (value && value.trim()==="") ) {
                    value = "None";
                    forceit = false;
                    try {
                        $("#a-"+aid+"-currentArtist").html("");
                        $("#a-"+aid+"-currentAlbum").html("");
                        $("#a-"+aid+"-trackImage").html("");
                    } catch (err) { console.log(err); }
                } 
                
                // if ( (forceit || (value!==oldvalue)) && !value.startsWith("Grouped with") ) {
                if ( value!==oldvalue ) {
                    value = value.trim();
                    console.log("music track changed from: [" + oldvalue + "] to: [" + value + "]");
                }
                
            // add status of things to the class and remove old status
            } else if ( oldclass && oldvalue && value &&
                    key!=="name" && key!=="trackImage" && key!=="color" &&
                    key!=="trackDescription" && key!=="mediaSource" &&
                    key!=="currentArtist" && key!=="currentAlbum" &&
                    $.isNumeric(value)===false && 
                    $.isNumeric(oldvalue)===false &&
                    oldclass.indexOf(oldvalue)>=0 ) 
            {
                    $(targetid).removeClass(oldvalue);
                    $(targetid).addClass(value);
            }

            // update the content 
            if (oldvalue || value) {
                try {
                    $(targetid).html(value);
                } catch (err) {}
            }
        }
    });
    
    // if we updated a clock skin render it on the page
    if ( isclock ) {
        CoolClock.findAndCreateClocks();
    }
}

function refreshTile(aid, bid, thetype, hubnum) {
    var ajaxcall = "doquery";
    $.post(cm_Globals.returnURL, 
        {useajax: ajaxcall, id: bid, type: thetype, value: "none", attr: "none", hubid: hubnum} );
}

// refresh tiles on this page when switching to it
function setupTabclick() {
    // $("li.ui-tab > a").click(function() {
    $("a.ui-tabs-anchor").click(function() {
        // save this tab for default next time
        var defaultTab = $(this).attr("id");
        if ( defaultTab ) {
            setCookie( 'defaultTab', defaultTab, 30 );
        }
    });
}

function clockUpdater(tz) {

    // update the date every hour
    setInterval(function() {
        // var old = new Date();
        // var utc = old.getTime() + (old.getTimezoneOffset() * 60000);
        // var d = new Date(utc + (1000*tz));        
        var d = new Date();

        var weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        var months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        var dofw = d.getDay();
        var mofy = d.getMonth();
        var weekday = weekdays[dofw];
        var month = months[mofy];
        var day = d.getDate().toString();
        if ( day < 10 ) {
            day = "0" + day.toString();
        } else {
            day = day.toString();
        }
        var year = d.getFullYear().toString();
        
        // set the weekday
        $("div.panel div.clock.weekday").each(function() {
            $(this).html(weekday);
        });

        // set the date
        $("div.panel div.clock.date").each(function() {
            if ( $(this).parent().siblings("div.overlay.fmt_date").length > 0 ) {
                var timestr = $(this).parent().siblings("div.overlay.fmt_date").children("div.fmt_date").html();
                timestr = timestr.replace("M",month);
                timestr = timestr.replace("d",day);
                timestr = timestr.replace("Y",year);
                $(this).html(timestr);
            } else if ( $(this).siblings("div.user_hidden").length > 0 ) {
                var linkval = $(this).siblings("div.user_hidden").attr("linkval");
                if ( linkval && $("div.clock.date.p_"+linkval) ) {
                    var timestr = $("div.clock.date.p_"+linkval).html();
                    $(this).html(timestr);
                }
            } else {
                var defstr = month + " " + day + ", " + year;
                $(this).html(defstr);
            }
        });
    }, 5000 );

    setInterval(function() {
        // var old = new Date();
        // var utc = old.getTime() + (old.getTimezoneOffset() * 60000);
        // var d = new Date(utc + (1000*tz));     
        var d = new Date();
        
        // var ds = d.toString().split(" ");    
        // var defaultstr = ds[4];
        var hour24 = d.getHours();
        var hour = hour24;
        var min = d.getMinutes();
        if ( min < 10 ) { 
            min = "0" + min.toString();
        } else {
            min = (+ min).toString();
        }
        var sec = d.getSeconds();
        if ( sec < 10 ) { 
            sec = "0" + sec.toString();
        } else {
            sec = sec.toString();
        }
        if ( hour24=== 0 ) {
            hour = "12";
        } else if ( hour24 > 12 ) {
            hour = (+hour24 - 12).toLocaleString();
        }
        var defaultstr = hour.toString() + ":" + min + ":" + sec;
        
        // update the time of all things on the main page
        // this skips the wysiwyg items in edit boxes
        // include format if provided by user in a sibling field
        $("div.panel div.clock.time").each(function() {
            if ( $(this).parent().siblings("div.overlay.fmt_time").length > 0 ) {
                var timestr = $(this).parent().siblings("div.overlay.fmt_time").children("div.fmt_time").html();
                timestr = timestr.replace("g",hour);
                timestr = timestr.replace("h",hour);
                timestr = timestr.replace("G",hour24);
                timestr = timestr.replace("H",hour24);
                timestr = timestr.replace("i",min);
                timestr = timestr.replace("s",sec);
                if ( hour24 >= 12 ) {
                    timestr = timestr.replace("a","pm");
                    timestr = timestr.replace("A","PM");
                } else {
                    timestr = timestr.replace("a","am");
                    timestr = timestr.replace("A","AM");
                }
                $(this).html(timestr);
            // take care of linked times
            } else if ( $(this).siblings("div.user_hidden").length > 0 ) {
                var linkval = $(this).siblings("div.user_hidden").attr("linkval");
                var ival = parseInt(linkval);
                if ( linkval && !isNaN(ival) && $("div.clock.time.p_"+linkval) ) {
                    var timestr = $("div.clock.time.p_"+linkval).html();
                    $(this).html(timestr);
                }
            } else {
                var timestr = defaultstr;
                if ( hour24 >= 12 ) {
                    timestr+= " PM";
                } else {
                    timestr+= " AM";
                }
                $(this).html(timestr);
            }
        });
    }, 1000);
}

function setupTimer(timerval, timertype, hubnum) {

    // we now pass the unique hubId value instead of numerical hub
    // since the number can now change when new hubs are added and deleted
    var updarray = [timertype, timerval, hubnum];
    updarray.myMethod = function() {

        var that = this;
        console.log("hub #" + that[2] + " timer = " + that[1] + " timertype = " + that[0] + " priorOpmode= " + priorOpmode + " modalStatus= " + modalStatus);
        var err;

        // skip if not in operation mode or if inside a modal dialog box
        if ( priorOpmode !== "Operate" || modalStatus > 0 ) { 
            // repeat the method above indefinitely
            setTimeout(function() {updarray.myMethod();}, that[1]);
            return; 
        }

        try {
            $.post(cm_Globals.returnURL, 
                {useajax: "doquery", id: that[0], type: that[0], value: "none", attr: "none", hubid: that[2]},
                function (presult, pstatus) {

                    // skip all this stuff if we dont return an object
                    if (pstatus==="success" && typeof presult==="object" ) {

                        if ( LOGWEBSOCKET ) {
                            var keys = Object.keys(presult);
                            console.log("pstatus = ", pstatus, " loaded ", keys.length, " things from server");
                        }
    
                        // go through all tiles and update
                        try {
                            $('div.panel div.thing').each(function() {
                                var aid = $(this).attr("id");
                                // skip the edit in place tile
                                if ( aid.startsWith("t-") ) {
                                    aid = aid.substring(2);
                                    var tileid = $(this).attr("tile");
                                    var strtype = $(this).attr("type");

                                    var thevalue;
                                    try {
                                        thevalue = presult[tileid];
                                    } catch (err) {
                                        tileid = parseInt(tileid, 10);
                                        try {
                                            thevalue = presult[tileid];
                                        } catch (err) { 
                                            thevalue = null; 
                                            console.log(err.message);
                                        }
                                    }
                                    // handle both direct values and bundled values
                                    if ( thevalue && thevalue.hasOwnProperty("value") ) {
                                        thevalue = thevalue.value;
                                    }
                                    
                                    // do not update names because they are never updated on groovy
                                    // also skip updating music and audio album art if using websockets 
                                    // since doing it here messes up the websocket updates
                                    // I actually kept the audio refresh since it seems to work okay
                                    if ( thevalue && typeof thevalue==="object" ) {
                                        if ( thevalue["name"] ) { delete thevalue["name"]; }
                                        if ( thevalue["password"] ) { delete thevalue["password"]; }
                                        if ( strtype==="music" ) {
                                            if ( thevalue["trackDescription"] ) { delete thevalue["trackDescription"]; }
                                            if ( thevalue["trackImage"] ) { delete thevalue["trackImage"]; }
                                            if ( thevalue["currentArtist"] ) { delete thevalue["currentArtist"]; }
                                            if ( thevalue["currentAlbum"] ) { delete thevalue["currentAlbum"]; }
                                        }
                                        // if ( strtype==="audio" && thevalue["audioTrackData"] ) {
                                        //     delete thevalue["audioTrackData"];
                                        // }
                                        updateTile(aid, thevalue); 
                                    }
                                }
                            });
                        } catch (err) { console.error("Polling error", err.message); }
                    }
                }, "json"
            );
        } catch(err) {
            console.error ("Polling error", err.message);
        }

        // repeat the method above indefinitely
        // console.log("timer= " + that[1]);
        setTimeout(function() {updarray.myMethod();}, that[1]);
    };

    // wait before doing first one - or skip this hub if requested
    if ( timerval && timerval >= 1000 ) {
        // alert("timerval = " + timerval);
        setTimeout(function() {updarray.myMethod();}, timerval);
    }
    
}

// setup clicking on the action portion of this thing
// this used to be done by page but now it is done by sensor type
function setupPage() {
    
    $("div.overlay > div").off("click.tileactions");
    $("div.overlay > div").on("click.tileactions", function(evt) {

        var that = this;
        var aid = $(this).attr("aid");
        var subid = $(this).attr("subid");
        var id = $(this).attr("id");
        
        // avoid doing click if the target was the title bar
        // also skip sliders tied to subid === level or colorTemperature
        if ( ( typeof aid==="undefined" ) || 
             ( subid==="level" ) || 
             ( subid==="colorTemperature" ) ||
             ( id && id.startsWith("s-") ) ) {
            return;
        }
        
        // var tile = '#t-'+aid;
        var thetype = $(that).attr("type");
        var thingname = $("#s-"+aid).html();
        
        // handle special control type tiles that perform javascript actions
        // if we are not in operate mode only do this if click is on operate
        // this is the only type tile that cannot be customized
        // which means it also cannot be password protected
        // TODO - change this in the future
        if ( thetype==="control" && (priorOpmode==="Operate" || subid==="operate") ) {
            if ( $(this).hasClass("confirm") ) {
                var pos = {top: 100, left: 100};
                createModal("modalexec","<p>Perform " + subid + " operation ... Are you sure?</p>", "body", true, pos, function(ui) {
                    var clk = $(ui).attr("name");
                    if ( clk==="okay" && subid!=="name" ) {
                        execButton(subid);
                    }
                });
            } else {
                if ( subid!=="name" ) {
                    execButton(subid);
                }
            }
            return;
        }

        // ignore all other clicks if not in operate mode
        // including any password protected ones
        if ( priorOpmode!=="Operate" ) {
            return;
        }
        
        // check for clicking on a password field
        // or any other field of a tile with a password sibling
        // this can only be true if user has added one using tile customizer
        var pw = false;
        if ( subid==="password" ) {
            pw = $(this).html();
        } else {
            var pwsib = $(this).parent().siblings("div.overlay.password");
            if ( pwsib && pwsib.length > 0 ) {
                pw = pwsib.children("div.password").html();
            }
        }
            
        // now ask user to provide a password to activate this tile
        // or if an empty password is given this becomes a confirm box
        // the dynamically created dialog box includes an input string if pw given
        // uses a simple md5 hash to store user password - this is not strong security
        if ( typeof pw === "string" && pw!==false ) {
            checkPassword(that, thingname, pw, processClick);
        } else {
            processClick(that, thingname);
        }
        evt.stopPropagation();

    });
   
}

function checkPassword(tile, thingname, pw, yesaction) {

    var userpw = "";
    var tpos = $(tile).offset();
    var ttop = (tpos.top > 95) ? tpos.top - 90 : 5;
    var pos = {top: ttop, left: tpos.left};
    var htmlcontent;
    if ( pw==="" ) {
        htmlcontent = "<p>Operate action for tile [" + thingname + "] Are you sure?</p>";
    } else {
        htmlcontent = "<p>" + thingname + " is Password Protected</p>";
        htmlcontent += "<div class='ddlDialog'><label for='userpw'>Password:</label>";
        htmlcontent += "<input class='ddlDialog' id='userpw' type='password' size='20' value='' />";
        htmlcontent += "</div>";
    }
    
    createModal("modalexec", htmlcontent, "body", true, pos, 
    function(ui) {
        var clk = $(ui).attr("name");
        if ( clk==="okay" ) {
            if ( pw==="" ) {
                console.log("Tile action confirmed for tile [" + thingname + "]");
                yesaction(tile, thingname);
            } else {
                userpw = $("#userpw").val();
                $.post(cm_Globals.returnURL, 
                    {useajax: "pwhash", id: "none", type: "verify", value: userpw, attr: pw},
                    function (presult, pstatus) {
                        if ( pstatus==="success" && presult==="success" ) {
                            console.log("Protected tile [" + thingname + "] access granted.");
                            yesaction(tile, thingname);
                        } else {
                            console.log("Protected tile [" + thingname + "] access denied.");
                        }
                    }
                );

            }
        } else {
            console.log("Protected tile [" + thingname + "] access cancelled.");
        }
    },
    // after box loads set focus to pw field
    function(hook, content) {
        $("#userpw").focus();
        
        // set up return key to process and escape to cancel
        $("#userpw").off("keydown");
        $("#userpw").on("keydown",function(e) {
            if ( e.which===13  ){
                $("#modalokay").click();
            }
            if ( e.which===27  ){
                $("#modalcancel").click();
            }
        });
    });
}

function processClick(that, thingname) {
    var aid = $(that).attr("aid");
    var theattr = $(that).attr("class");
    var subid = $(that).attr("subid");
    var tile = '#t-'+aid;
    var thetype = $(tile).attr("type");
    var linktype = thetype;
    var linkval = "";
    var command = "";
    var bid = $(tile).attr("bid");
    var hubnum = $(tile).attr("hub");
    var targetid;
    if ( subid.endsWith("-up") || subid.endsWith("-dn") ) {
        var slen = subid.length;
        targetid = '#a-'+aid+'-'+subid.substring(0,slen-3);
    } else {
        targetid = '#a-'+aid+'-'+subid;
    }

    // all hubs now use the same doaction call name
    var ajaxcall = "doaction";
    var thevalue = $(targetid).html();

    // special case of thermostat clicking on things without values
    // send the temperature as the value
    if ( !thevalue && (thetype=="thermostat" || thetype==="isy") &&
         ( subid.endsWith("-up") || subid.endsWith("-dn") ) ) {
        thevalue = $("#a-"+aid+"-temperature").html();
        // alert(thevalue);
    }

    // handle music commands (which need to get subid command) and
    var ismusic = false;
    if ( subid.startsWith("music-" ) ) {
        thevalue = subid.substring(6);
        ismusic = true;
    }
    
    // handle linked tiles by looking for sibling
    // there is only one sibling for each of the music controls
    // check for companion sibling element for handling customizations
    // includes easy references for a URL or TEXT link
    // using jQuery sibling feature and check for valid http string
    // if found then switch the type to the linked type for calls
    // and grab the proper hub number
    var usertile = $(that).siblings(".user_hidden");
    var userval = "";
    
    if ( usertile && $(usertile).attr("command") ) {
        command = $(usertile).attr("command");    // command type
        // alert("Command = " + command);
        
        if ( ismusic ) {
            userval = thevalue;
        } else  {
            userval = $(usertile).attr("value");      // raw user provided val
        }
        linkval = $(usertile).attr("linkval");    // urlencooded val
        linktype = $(usertile).attr("linktype");  // type of tile linked to

        // handle redirects to a user provided web page
        // remove the http requirement to support Android stuff
        // this places extra burden on users to avoid doing stupid stuff
        // if ( command==="URL" && userval.startsWith("http") ) {
        if ( command==="URL" || (command==="TEXT" && userval.startsWith("http")) ) {
            window.open(userval,'_blank');
            return;

        // handle replacing text with user provided text that isn't a URL
        // for this case there is nothing to do on the server so we just
        // update the text on screen and return it to the log
        } else if ( command==="TEXT" ) {
            console.log(ajaxcall + ": thingname= " + thingname + " command= " + command + " bid= "+bid+" hub= " + hubnum + " type= " + thetype + " linktype= " + linktype + " subid= " + subid + " value= " + thevalue + " linkval= " + linkval + " attr="+theattr);
            $(targetid).html(thevalue);
        }

        // all the other command types are handled on the PHP server side
        // this is enabled by the settings above for command, linkval, and linktype
    }

    // turn momentary and piston items on or off temporarily
    // but only for the subid items that expect it
    // and skip if this is a custom action since it could be anything
    // also, for momentary buttons we don't do any tile updating
    // other than visually pushing the button by changing the class for 1.5 seconds
    if ( command==="" && ( (thetype==="momentary" && subid==="momentary") || (thetype==="piston" && subid.startsWith("piston")) ) ) {
        console.log(ajaxcall + ": thingname= " + thingname + " command= " + command + " bid= "+bid+" hub Id= " + hubnum + " type= " + thetype + " linktype= " + linktype + " subid= " + subid + " value= " + thevalue + " linkval= " + linkval + " attr="+theattr);
        var tarclass = $(targetid).attr("class");
        // define a class with method to reset momentary button
        var classarray = [$(targetid), tarclass, thevalue];
        classarray.myMethod = function() {
            this[0].attr("class", this[1]);
            this[0].html(this[2]);
        };

        $.post(cm_Globals.returnURL, 
            {useajax: ajaxcall, id: bid, type: thetype, value: thevalue, 
                attr: subid, subid: subid, hubid: hubnum},
            function(presult, pstatus) {
                if (pstatus==="success") {
                    console.log( ajaxcall + ": POST returned:", presult );
                    if (thetype==="piston") {
                        $(targetid).addClass("firing");
                        $(targetid).html("firing");
                    } else if ( $(targetid).hasClass("on") ) {
                        $(targetid).removeClass("on");
                        $(targetid).addClass("off");
                        $(targetid).html("off");
                    } else if ( $(targetid).hasClass("off") )  {
                        $(targetid).removeClass("off");
                        $(targetid).addClass("on");
                        $(targetid).html("on");
                    }
                    setTimeout(function(){classarray.myMethod();}, 1500);
                }
            }, "json");

    // for clicking on the video link simply reload the video which forces a replay
    } else if (     (thetype==="video" && subid==="video")
                 || (thetype==="frame" && subid==="frame")
                 || (thetype==="image" && subid==="image")
                 || (thetype==="blank" && subid==="blank")
                 || (thetype==="custom" && subid==="custom") ) {
        console.log("Refreshing special tile type: " + thetype);
        $(targetid).html(thevalue);
        
        // show popup window for blanks and customs
        if ( cm_Globals.allthings && (thetype==="blank" || thetype==="custom") ) {
            var idx = thetype + "|" + bid;
            var thing= cm_Globals.allthings[idx];
            var value = thing.value;
            var showstr = "";
            $.each(value, function(s, v) {
                if ( s!=="password" && !s.startsWith("user_") ) {
                    var txt = v.toString();
                    txt = txt.replace(/<.*?>/g,'');
                    showstr = showstr + s + ": " + txt + "<br>";
                }
            });
            var winwidth = $("#dragregion").innerWidth();
            var leftpos = $(tile).position().left + 5;
            if ( leftpos + 220 > winwidth ) {
                leftpos = leftpos - 110;
            }
            var pos = {top: $(tile).position().top + 80, left: leftpos};
            createModal("modalpopup", showstr, "body", false, pos, function(ui) {
            });
        }

    } else {
        // invert value for lights since we want them to do opposite of state
        // this isn't needed for ST or HE but I put this here for ISY
        // in ST and HE the inversion is handled in the groovy code on attr
        // and the value is ignored unless attr is blank which it won't be here
        // but for ISY we pass the value directly to the hub so must be right
        // however, I still inverted the ST and HE values to support future update
        // where I might just look at thevalue for these hubs types as it should be
        // the attr action was a terrible workaround put in a much earlier version
        if ( (thetype==="switch" || thetype==="switchlevel" || thetype==="bulb" || thetype==="light" ) &&
             (thevalue==="on" || thevalue==="off")  ) {
            thevalue = thevalue==="on" ? "off" : "on";
        }
        else if ( thetype==="isy" && (thevalue==="DON" || thevalue==="DOF" )  ) {
            thevalue = thevalue==="DON" ? "DOF" : "DON";
        }
        console.log(ajaxcall + ": thingname= " + thingname + " command= " + command + " bid= "+bid+" hub= " + hubnum + " type= " + thetype + " linktype= " + linktype + " subid= " + subid + " value= " + thevalue + " linkval= " + linkval + " attr="+theattr);

        // create a visual cue that we clicked on this item
        $(targetid).addClass("clicked");
        setTimeout( function(){ $(targetid).removeClass("clicked"); }, 750 );

        // pass the call to main routine
        // if an object is returned then show it in a popup dialog
        // values returned from actions are pushed in another place now
        // alert("API call: " + ajaxcall + " bid: " + bid + " type: " + thetype + " value: " + thevalue);
        $.post(cm_Globals.returnURL, 
               {useajax: ajaxcall, id: bid, type: thetype, value: thevalue, 
                attr: theattr, subid: subid, hubid: hubnum, command: command, linkval: linkval},
               function (presult, pstatus) {
                    if (pstatus==="success" && typeof presult==="object" ) {
                            var showstr = "";
                            $.each(presult, function(s, v) {
                                if ( s && v && s!=="password" && !s.startsWith("user_") ) {
                                    showstr = showstr + s + ": " + v.toString() + "<br>";
                                }
                            });
                            var winwidth = $("#dragregion").innerWidth();
                            var leftpos = $(tile).position().left + 5;
                            if ( leftpos + 220 > winwidth ) {
                                leftpos = leftpos - 110;
                            }
                            var pos = {top: $(tile).position().top + 80, left: leftpos};
                            closeModal("modalpopup");
                            createModal("modalpopup", showstr, "body", false, pos, function(ui) {} );
                    } else if ( pstatus==="success" && presult==="success" ) {
                        console.log("Success: result will be pushed later. status: ", pstatus, " result: ", presult)
                    } else {
                        console.log("Error: making ajax POST call. status: ", pstatus, " result: ", presult);
                    }
               }, "json"
        );

    } 
}
