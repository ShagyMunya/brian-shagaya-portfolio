package com.nyazuramusika.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.util.LruCache;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.InputMethodManager;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final int NAVY=Color.rgb(20,39,56), ORANGE=Color.rgb(182,71,23), GOLD=Color.rgb(255,179,77);
    private static final int INK=NAVY, MUTED=Color.rgb(82,100,117), PALE=Color.rgb(244,247,250), BORDER=Color.rgb(219,226,232);
    private static final String[] CATEGORIES={"Produce","Electronics","Clothing","Home & furniture","Farm supplies","Vehicles & parts","Other"};
    private static final String[] CURRENCIES={"USD","ZiG","ZAR"}, CONDITIONS={"New","Used","Not applicable"};
    private static final int PHOTO_REQUEST=102;
    private final Handler ui=new Handler(Looper.getMainLooper());
    private final ExecutorService executor=Executors.newFixedThreadPool(3);
    private final Map<String,EditText> fields=new LinkedHashMap<>();
    private final LruCache<String,Bitmap> photoCache=new LruCache<>(8*1024*1024) {
        @Override protected int sizeOf(String key,Bitmap bitmap){return bitmap.getAllocationByteCount();}
    };
    private SecureSession secure;
    private LinearLayout root, content, results, tabs;
    private ProgressBar progress;
    private TextView notice;
    private String screen="browse", query="", category="", area="", authAfter="browse", imageId="", photoUri="";
    private JSONObject seller=new JSONObject(), editing;
    private Spinner categoryPicker,currencyPicker,conditionPicker;
    private ImageView selectedPhoto;
    private byte[] photoJpeg;
    private long epoch=0, listRequest=0;
    private int offset=0;
    private boolean saving=false,photoLoading=false;
    private final Map<String,Button> categoryButtons=new LinkedHashMap<>();
    private Runnable pendingSearch;

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);secure=new SecureSession(this);
        try{seller=new JSONObject(secure.get("seller"));}catch(Exception ignored){}
        if(!"google".equals(seller.optString("auth_provider"))){secure.clearAccount();seller=new JSONObject();}
        createShell();
        if(handleAuthIntent(getIntent()))return;
        if(saved!=null) {
            query=saved.getString("query","");category=saved.getString("category","");area=saved.getString("area","");
            String previous=saved.getString("screen","browse");
            if(previous.equals("form")) {
                try{JSONObject record=new JSONObject(saved.getString("draft","{}"));showForm(record.optString("id").isEmpty()?null:record,record);
                    photoUri=saved.getString("photoUri","");if(!photoUri.isEmpty())loadSelectedPhoto(Uri.parse(photoUri));return;}catch(Exception ignored){}
            }
            if(previous.equals("my")){showMy();return;}
            if(previous.equals("profile")){showProfile();return;}
            if(previous.equals("account")){showAccount();return;}
            if(previous.equals("admin")){showAdmin();return;}
        }
        showBrowse();
    }
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);handleAuthIntent(intent);}
    @Override protected void onDestroy(){super.onDestroy();epoch++;executor.shutdownNow();ui.removeCallbacksAndMessages(null);}
    @Override protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state);state.putString("screen",screen);state.putString("query",query);state.putString("category",category);state.putString("area",area);
        if(screen.equals("form")) { try{state.putString("draft",formData(false).toString());state.putString("photoUri",photoUri);}catch(Exception ignored){} }
    }
    @Override public void onBackPressed(){if(saving){toast("Please wait for the listing to finish saving.");return;}if(screen.equals("browse"))super.onBackPressed();else showBrowse();}

    private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
    private GradientDrawable background(int color,int radius,boolean border){GradientDrawable drawable=new GradientDrawable();drawable.setColor(color);drawable.setCornerRadius(dp(radius));if(border)drawable.setStroke(dp(1),BORDER);return drawable;}
    private LinearLayout box(){LinearLayout view=new LinearLayout(this);view.setOrientation(LinearLayout.VERTICAL);return view;}
    private TextView text(String value,int size,int color,boolean bold){TextView view=new TextView(this);view.setText(value);view.setTextSize(size);view.setTextColor(color);view.setLineSpacing(dp(3),1);if(bold)view.setTypeface(Typeface.DEFAULT,Typeface.BOLD);return view;}
    private void add(LinearLayout parent,View view,int margin){LinearLayout.LayoutParams params=new LinearLayout.LayoutParams(-1,-2);params.bottomMargin=dp(margin);parent.addView(view,params);}
    private Button button(String value,boolean primary,Runnable action){Button view=new Button(this);view.setText(value);view.setTextSize(15);view.setAllCaps(false);view.setMinHeight(dp(48));view.setPadding(dp(14),dp(10),dp(14),dp(10));view.setTextColor(primary?Color.WHITE:INK);view.setBackground(background(primary?ORANGE:Color.WHITE,12,!primary));view.setOnClickListener(v->action.run());return view;}
    private EditText input(LinearLayout parent,String key,String label,String value,int type){add(parent,text(label,14,MUTED,true),4);EditText view=new EditText(this);view.setSingleLine(true);view.setTextSize(16);view.setTextColor(INK);view.setHintTextColor(MUTED);view.setPadding(dp(12),dp(10),dp(12),dp(10));view.setMinHeight(dp(50));view.setInputType(type);view.setBackground(background(Color.WHITE,10,true));view.setText(value);view.setContentDescription(label);fields.put(key,view);add(parent,view,15);return view;}
    private Spinner picker(LinearLayout parent,String label,String[] values,String current){add(parent,text(label,14,MUTED,true),4);Spinner spinner=new Spinner(this);ArrayAdapter<String> adapter=new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,values);spinner.setAdapter(adapter);spinner.setContentDescription(label);spinner.setMinimumHeight(dp(50));spinner.setBackground(background(Color.WHITE,10,true));for(int i=0;i<values.length;i++)if(values[i].equals(current))spinner.setSelection(i);add(parent,spinner,15);return spinner;}
    private void createShell(){
        root=box();root.setBackgroundColor(NAVY);setContentView(root);
        root.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(0,insets.getSystemWindowInsetTop(),0,insets.getSystemWindowInsetBottom());return insets.consumeSystemWindowInsets();});
        LinearLayout header=new LinearLayout(this);header.setGravity(Gravity.CENTER_VERTICAL);header.setPadding(dp(16),dp(12),dp(16),dp(12));
        TextView mark=text("N",24,NAVY,true);mark.setGravity(Gravity.CENTER);mark.setBackground(background(GOLD,13,false));header.addView(mark,new LinearLayout.LayoutParams(dp(42),dp(42)));
        LinearLayout branding=box();branding.setPadding(dp(12),0,0,0);branding.addView(text("NyazuraMusika",22,Color.WHITE,true));branding.addView(text("Buy & sell around Nyazura",14,Color.rgb(204,216,226),false));header.addView(branding,new LinearLayout.LayoutParams(0,-2,1));root.addView(header);
        progress=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);progress.setIndeterminate(true);progress.setVisibility(View.GONE);root.addView(progress,new LinearLayout.LayoutParams(-1,dp(3)));
        notice=text("",14,Color.WHITE,false);notice.setPadding(dp(16),dp(8),dp(16),dp(8));notice.setVisibility(View.GONE);root.addView(notice);
        ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);scroll.setBackgroundColor(PALE);content=box();content.setPadding(dp(16),dp(18),dp(16),dp(18));scroll.addView(content);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        tabs=new LinearLayout(this);tabs.setBackgroundColor(Color.WHITE);tabs.setPadding(dp(8),dp(8),dp(8),dp(8));root.addView(tabs);
    }
    private void reset(String next){epoch++;screen=next;fields.clear();content.removeAllViews();notice.setVisibility(View.GONE);progress.setVisibility(View.GONE);tabs.removeAllViews();
        String[] labels={"Browse",isAdmin()?"Admin":canSell()?"My goods":"Sell goods","Account"};Runnable[] actions={this::showBrowse,isAdmin()?this::showAdmin:canSell()?this::showMy:this::showSell,this::showAccount};for(int i=0;i<labels.length;i++){Button tab=button(labels[i],false,actions[i]);tab.setTextSize(14);LinearLayout.LayoutParams params=new LinearLayout.LayoutParams(0,-2,1);params.setMargins(dp(3),0,dp(3),0);tabs.addView(tab,params);}}
    private void toast(String message){Toast.makeText(this,message,Toast.LENGTH_LONG).show();}
    private void busy(boolean value){progress.setVisibility(value?View.VISIBLE:View.GONE);}
    private void error(String message){notice.setText(message);notice.setVisibility(View.VISIBLE);}
    private boolean canMove(){if(saving){toast("Please wait for the listing to finish saving.");return false;}return true;}
    private boolean signedIn(){return !secure.get("token").isEmpty();}
    private boolean isAdmin(){return signedIn()&&"admin".equals(seller.optString("role"));}
    private boolean canSell(){return signedIn()&&("seller".equals(seller.optString("role"))||isAdmin());}
    private void remember(JSONObject response)throws Exception{seller=response.getJSONObject("account");secure.put("seller",seller.toString());}
    private interface Task{JSONObject run()throws Exception;}
    private interface Done{void accept(JSONObject result)throws Exception;}
    private void job(Task task,Done done,Runnable failed){final long viewEpoch=epoch;busy(true);executor.execute(()->{
        try{JSONObject result=task.run();ui.post(()->{if(isDestroyed()||epoch!=viewEpoch)return;busy(false);try{done.accept(result);}catch(Exception e){error("Unable to complete this action. Please try again.");if(failed!=null)failed.run();}});}
        catch(Exception exception){ui.post(()->{if(isDestroyed()||epoch!=viewEpoch)return;busy(false);String message=exception.getMessage();error(exception instanceof MarketApi.ApiException?message:"Could not connect. Check your internet connection and try again.");if(failed!=null)failed.run();});}
    });}
    private void watch(EditText input,Runnable action){input.addTextChangedListener(new TextWatcher(){public void beforeTextChanged(CharSequence s,int start,int count,int after){}public void onTextChanged(CharSequence s,int start,int before,int count){action.run();}public void afterTextChanged(Editable value){}});}

    private void showBrowse(){if(!canMove())return;if(!signedIn()){showSignIn("browse");return;}reset("browse");add(content,text("Find something nearby",25,INK,true),14);
        EditText search=input(content,"search","Search goods",query,InputType.TYPE_CLASS_TEXT);search.setHint("What are you looking for?");
        EditText location=input(content,"area","Area (optional)",area,InputType.TYPE_CLASS_TEXT);location.setHint("Nyazura or your nearby area");
        Runnable changed=()->{query=search.getText().toString();area=location.getText().toString();if(pendingSearch!=null)ui.removeCallbacks(pendingSearch);pendingSearch=()->{if(screen.equals("browse"))loadMarket(false);};ui.postDelayed(pendingSearch,400);};watch(search,changed);watch(location,changed);
        HorizontalScrollView horizontal=new HorizontalScrollView(this);horizontal.setHorizontalScrollBarEnabled(false);LinearLayout row=new LinearLayout(this);horizontal.addView(row);
        categoryButtons.clear();String[] all=new String[CATEGORIES.length+1];all[0]="All";System.arraycopy(CATEGORIES,0,all,1,CATEGORIES.length);
        for(String label:all){String value=label.equals("All")?"":label;Button chip=button(label,false,()->{category=value;for(Map.Entry<String,Button> entry:categoryButtons.entrySet()){boolean chosen=entry.getKey().equals(category);entry.getValue().setTextColor(chosen?Color.WHITE:INK);entry.getValue().setBackground(background(chosen?NAVY:Color.WHITE,20,!chosen));}loadMarket(false);});if(category.equals(value)){chip.setTextColor(Color.WHITE);chip.setBackground(background(NAVY,20,false));}LinearLayout.LayoutParams params=new LinearLayout.LayoutParams(-2,-2);params.rightMargin=dp(8);row.addView(chip,params);categoryButtons.put(value,chip);}add(content,horizontal,16);
        add(content,button("Refresh market",false,()->loadMarket(false)),12);results=box();content.addView(results);loadMarket(false);
    }
    private void loadMarket(boolean more){if(!screen.equals("browse"))return;final long requestId=++listRequest;if(!more){offset=0;results.removeAllViews();add(results,text("Loading goods…",16,MUTED,false),12);}final int page=offset;
        String path="/api/listings?limit=20&offset="+page+"&q="+Uri.encode(query)+"&location="+Uri.encode(area)+(category.isEmpty()?"":"&category="+Uri.encode(category));
        job(()->MarketApi.call(path,"GET",null,secure.get("token")),response->{if(requestId!=listRequest)return;if(!more)results.removeAllViews();JSONArray items=response.getJSONArray("listings");
            if(!more&&items.length()==0){add(results,text("No goods found",23,INK,true),8);add(results,text(query.isEmpty()&&category.isEmpty()&&area.isEmpty()?"Be the first to post goods for sale around Nyazura.":"Try a different search, category or area.",16,MUTED,false),16);add(results,button("Post goods for sale",true,this::showSell),12);}
            for(int i=0;i<items.length();i++)add(results,card(items.getJSONObject(i),false),14);
            offset=response.getInt("next_offset");if(response.optBoolean("has_more")){Button load=button("Load more goods",false,()->{});load.setOnClickListener(v->{load.setEnabled(false);loadMarket(true);results.removeView(load);});add(results,load,12);}
        },()->{if(requestId==listRequest&&!more){results.removeAllViews();add(results,text("The market could not load.",18,INK,true),8);add(results,button("Try again",true,()->loadMarket(false)),12);}});
    }
    private LinearLayout card(JSONObject listing,boolean owned){LinearLayout card=box();card.setBackground(background(Color.WHITE,16,true));card.setPadding(dp(12),dp(12),dp(12),dp(12));
        String image=listing.optString("image_path","");if(!image.isEmpty()&&!image.equals("null")){ImageView picture=new ImageView(this);picture.setScaleType(ImageView.ScaleType.CENTER_CROP);picture.setContentDescription(listing.optString("title"));picture.setBackground(background(PALE,10,false));picture.setClipToOutline(true);card.addView(picture,new LinearLayout.LayoutParams(-1,dp(165)));fetchPhoto(image,picture,false);}
        TextView tag=text(listing.optString("category")+(listing.optString("status").equals("sold")?"  ·  SOLD":""),14,MUTED,true);tag.setPadding(0,dp(10),0,0);add(card,tag,6);
        add(card,text(listing.optString("title"),21,INK,true),6);add(card,text(MarketRules.price(listing.optLong("price_minor"),listing.optString("currency")),23,ORANGE,true),6);add(card,text(listing.optString("location")+" · "+listing.optString("condition"),14,MUTED,false),12);
        add(card,button(owned?"Manage listing":"View goods",false,()->showDetails(listing)),0);return card;
    }
    private void fetchPhoto(String path,ImageView target,boolean large){Bitmap cached=photoCache.get(path+(large?"large":"small"));if(cached!=null){target.setImageBitmap(cached);return;}final long version=epoch;executor.execute(()->{try{byte[] bytes=MarketApi.photo(path,secure.get("token"));BitmapFactory.Options options=new BitmapFactory.Options();options.inSampleSize=large?1:2;Bitmap image=BitmapFactory.decodeByteArray(bytes,0,bytes.length,options);if(image!=null){photoCache.put(path+(large?"large":"small"),image);ui.post(()->{if(epoch==version&&!isDestroyed())target.setImageBitmap(image);});}}catch(Exception ignored){ui.post(()->{if(epoch==version)target.setContentDescription("Photo could not load");});}});}
    private void showDetails(JSONObject initial){if(!canMove())return;reset("detail");add(content,button("Back to market",false,this::showBrowse),12);add(content,text("Loading listing…",16,MUTED,false),12);
        job(()->MarketApi.call("/api/listings/"+initial.getString("id"),"GET",null,secure.get("token")),response->renderDetails(response.getJSONObject("listing")),null);
    }
    private void renderDetails(JSONObject listing){content.removeAllViews();add(content,button("Back to market",false,this::showBrowse),14);
        String path=listing.optString("image_path","");if(!path.isEmpty()&&!path.equals("null")){ImageView picture=new ImageView(this);picture.setScaleType(ImageView.ScaleType.CENTER_CROP);picture.setContentDescription(listing.optString("title"));content.addView(picture,new LinearLayout.LayoutParams(-1,dp(250)));fetchPhoto(path,picture,true);}
        add(content,text(listing.optString("category")+" · "+listing.optString("condition"),14,MUTED,true),8);add(content,text(listing.optString("title"),29,INK,true),10);add(content,text(MarketRules.price(listing.optLong("price_minor"),listing.optString("currency")),29,ORANGE,true),12);
        add(content,text(listing.optString("description"),17,INK,false),18);add(content,text("Collection area",14,MUTED,true),3);add(content,text(listing.optString("location"),18,INK,false),16);
        add(content,text("Seller",14,MUTED,true),3);add(content,text(listing.optString("seller_name"),18,INK,true),12);
        boolean owned=canSell()&&listing.optString("owner_id").equals(seller.optString("id"));
        if(owned){add(content,button("Edit listing",true,()->showForm(listing,null)),10);add(content,button(listing.optString("status").equals("sold")?"Make available again":"Mark as sold",false,()->changeStatus(listing)),10);add(content,button("Remove listing",false,()->new AlertDialog.Builder(this).setTitle("Remove this listing?").setMessage("It will disappear from the market.").setNegativeButton("Keep listing",null).setPositiveButton("Remove",(dialog,which)->removeListing(listing)).show()),10);}
        else if(listing.optString("status").equals("sold"))add(content,text("This item has been sold.",19,MUTED,true),12);
        else{add(content,button("See the goods live",true,()->requestLiveCheck(listing)),12);add(content,button("Contact seller on WhatsApp",false,()->contact(listing)),12);add(content,text("Inspect the goods with the seller before preparing an EcoCash payment.",14,MUTED,false),12);}
        if(!owned)add(content,button("Save these goods",false,()->job(()->MarketApi.call("/api/favorites/"+listing.getString("id"),"POST",null,secure.get("token")),result->toast("Saved to your goods."),null)),12);
    }
    private void contact(JSONObject listing){try{String number=MarketRules.whatsapp(listing.getString("whatsapp")).substring(1);String message="Hi "+listing.optString("seller_name")+", I saw your "+listing.optString("title")+" on NyazuraMusika for "+MarketRules.price(listing.optLong("price_minor"),listing.optString("currency"))+". Is it still available?";openUrl("https://wa.me/"+number+"?text="+Uri.encode(message));}catch(Exception e){toast("The seller's WhatsApp number is unavailable.");}}
    private void changeStatus(JSONObject listing){job(()->{JSONObject data=new JSONObject(listing.toString());data.put("status",listing.optString("status").equals("sold")?"active":"sold");return MarketApi.call("/api/listings/"+listing.getString("id"),"PUT",data,secure.get("token"));},result->{toast("Listing updated.");showMy();},null);}
    private void removeListing(JSONObject listing){job(()->MarketApi.call("/api/listings/"+listing.getString("id"),"DELETE",null,secure.get("token")),result->{toast("Listing removed.");showMy();},null);}

    private void showSell(){if(!canMove())return;if(!signedIn()){showSignIn("sell");return;}if(!canSell()||seller.optString("whatsapp").isEmpty()||seller.optString("display_name").isEmpty()){showProfile();return;}showForm(null,null);}
    private void showMy(){if(!canMove())return;if(!signedIn()){showSignIn("my");return;}if(!canSell()){showProfile();return;}reset("my");add(content,text("My listings",27,INK,true),10);add(content,button("Sell goods",true,this::showSell),10);add(content,button("Seller profile",false,this::showProfile),14);
        job(()->MarketApi.call("/api/my-listings","GET",null,secure.get("token")),response->{JSONArray items=response.getJSONArray("listings");if(items.length()==0){add(content,text("Your stall is ready",23,INK,true),8);add(content,text("Post your first item and let nearby buyers find it.",16,MUTED,false),14);add(content,button("Sell goods",true,this::showSell),12);}for(int i=0;i<items.length();i++)add(content,card(items.getJSONObject(i),true),14);},()->add(content,button("Sign in again",false,()->showSignIn("my")),12));
    }
    private void showSignIn(String after){if(!canMove())return;reset("signin");authAfter=after;add(content,text("Welcome to NyazuraMusika",29,INK,true),12);add(content,text("Sign in with your Google account to buy nearby or sell your goods.",17,MUTED,false),16);add(content,button("Sign in with Google",true,this::startSignIn),12);add(content,text("Choose your Google account in the browser, then tap Return to NyazuraMusika. New accounts start as users. You can register as a seller after signing in.",15,MUTED,false),14);}
    private String randomToken(int length){byte[] bytes=new byte[length];new SecureRandom().nextBytes(bytes);return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);}
    private void startSignIn(){job(()->MarketApi.call("/api/auth/config","GET",null,null),result->{if(!result.optBoolean("configured")){error("Google sign-in is not connected yet. The app owner needs to finish Google setup.");return;}try{String verifier=randomToken(32),state=randomToken(24);secure.put("verifier",verifier);secure.put("state",state);secure.put("started",Long.toString(System.currentTimeMillis()));secure.put("after",authAfter);String challenge=Base64.getUrlEncoder().withoutPadding().encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.UTF_8)));openUrl(BuildConfig.MARKET_API_ORIGIN+"/api/auth/google/start?challenge="+Uri.encode(challenge)+"&state="+Uri.encode(state));}catch(Exception e){error("Secure sign-in could not start on this device. Please try again.");}},null);}
    private boolean handleAuthIntent(Intent intent){Uri link=intent.getData();if(link!=null&&"nyazuramusika".equals(link.getScheme())&&"home".equals(link.getHost())){showLiveChecks();return true;}if(link==null||!"nyazuramusika".equals(link.getScheme())||!"auth".equals(link.getHost()))return false;
        String state=link.getQueryParameter("state"),code=link.getQueryParameter("code"),verifier=secure.get("verifier");long started=0;try{started=Long.parseLong(secure.get("started"));}catch(Exception ignored){}
        if(state==null||!state.equals(secure.get("state"))||code==null||!code.matches("[A-Za-z0-9_-]{43}")||verifier.isEmpty()||System.currentTimeMillis()-started>600_000){showSignIn("sell");error("That sign-in link expired. Please start again.");return true;}
        reset("signin");add(content,text("Connecting your Google account…",25,INK,true),12);String expectedState=state;
        job(()->{JSONObject data=new JSONObject();data.put("code",code);data.put("verifier",verifier);data.put("state",expectedState);return MarketApi.call("/api/auth/exchange","POST",data,null);},result->{secure.put("token",result.getString("token"));remember(result);secure.remove("verifier");secure.remove("state");secure.remove("started");toast("You are signed in.");String after=secure.get("after");secure.remove("after");if(after.equals("sell"))showSell();else if(after.equals("my"))showMy();else if(isAdmin())showAdmin();else showBrowse();},()->add(content,button("Start sign-in again",true,()->showSignIn("browse")),12));return true;
    }
    private void showProfile(){if(!canMove())return;if(!signedIn()){showSignIn("sell");return;}boolean register=!canSell();reset("profile");add(content,text(register?"Become a seller":"Seller profile",27,INK,true),10);add(content,text("Your seller name and WhatsApp number appear on your listings.",16,MUTED,false),16);input(content,"name","Seller name",seller.optString("display_name"),InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_FLAG_CAP_WORDS);EditText phone=input(content,"phone","WhatsApp number",seller.optString("whatsapp"),InputType.TYPE_CLASS_PHONE);phone.setHint("+263771234567");EditText wallet=input(content,"wallet","EcoCash receiving number (optional)",seller.optString("ecocash_phone"),InputType.TYPE_CLASS_PHONE);wallet.setHint("+263771234567");add(content,text("Buyers use this number to pay you directly through EcoCash. Do not enter a PIN here.",14,MUTED,false),12);
        Button save=button(register?"Register as a seller":"Save profile",true,()->{});save.setOnClickListener(v->{try{String name=fields.get("name").getText().toString().trim();if(name.length()<2||name.length()>60)throw new IllegalArgumentException("Enter a seller name containing 2–60 characters.");JSONObject data=new JSONObject();data.put("display_name",name);data.put("whatsapp",MarketRules.whatsapp(fields.get("phone").getText().toString()));String receiving=fields.get("wallet").getText().toString().trim();data.put("ecocash_phone",receiving.isEmpty()?"":MarketRules.whatsapp(receiving));save.setEnabled(false);job(()->MarketApi.call(register?"/api/me/seller":"/api/me",register?"POST":"PUT",data,secure.get("token")),result->{remember(result);toast(register?"You are registered as a seller.":"Seller profile saved.");showSell();},()->save.setEnabled(true));}catch(Exception e){error(e.getMessage());}});add(content,save,12);add(content,button("Back to account",false,this::showAccount),10);
    }

    private void showAccount(){if(!canMove())return;if(!signedIn()){showSignIn("browse");return;}reset("account");add(content,text("Your account",27,INK,true),12);
        job(()->MarketApi.call("/api/me","GET",null,secure.get("token")),response->{remember(response);reset("account");add(content,text(seller.optString("display_name"),27,INK,true),8);add(content,text(seller.optString("email"),16,MUTED,false),10);add(content,text("Role: "+roleLabel(seller.optString("role")),18,ORANGE,true),18);
            if(isAdmin())add(content,button("Admin dashboard",true,this::showAdmin),12);
            if(canSell()){add(content,button("Sell goods",true,this::showSell),12);add(content,button("My listings",false,this::showMy),12);add(content,button("Seller profile",false,this::showProfile),12);}
            else{add(content,text("Browse goods and contact sellers on WhatsApp. Register as a seller when you have something to sell.",16,MUTED,false),16);add(content,button("Become a seller",true,this::showProfile),12);}
            add(content,button("Saved goods",false,this::showSaved),12);add(content,button("Live checks",false,this::showLiveChecks),12);add(content,button("Purchases & receipts",false,this::showOrders),12);
            add(content,button("Browse goods",false,this::showBrowse),12);add(content,button("Privacy and your account",false,()->openUrl(BuildConfig.MARKET_API_ORIGIN+"/privacy")),12);add(content,button("Sign out",false,this::signOut),12);
        },()->add(content,button("Sign in with Google again",false,()->showSignIn("browse")),12));
    }
    private String roleLabel(String role){return role.equals("admin")?"Admin":role.equals("seller")?"Seller":"User";}
    private void signOut(){String token=secure.get("token");executor.execute(()->{try{MarketApi.call("/api/auth/logout","POST",null,token);}catch(Exception ignored){}});secure.clearAccount();seller=new JSONObject();photoCache.evictAll();showSignIn("browse");}
    private void showAdmin(){if(!canMove())return;if(!signedIn()){showSignIn("browse");return;}if(!isAdmin()){showAccount();return;}reset("admin");add(content,text("Admin dashboard",28,INK,true),16);
        job(()->MarketApi.call("/api/admin/overview","GET",null,secure.get("token")),response->{JSONObject accounts=response.getJSONObject("accounts"),goods=response.getJSONObject("goods");
            add(content,text(accounts.optInt("total")+" accounts",25,INK,true),8);add(content,text(accounts.optInt("users")+" users · "+accounts.optInt("sellers")+" sellers · "+accounts.optInt("admins")+" admins",16,MUTED,false),8);add(content,text(accounts.optInt("suspended")+" suspended accounts",16,MUTED,false),18);
            add(content,text(goods.optInt("active")+" available listings",25,INK,true),8);add(content,text(goods.optInt("sold")+" sold · "+goods.optInt("removed")+" removed",16,MUTED,false),20);
            add(content,button("Manage accounts & roles",true,()->showAdminAccounts("",0)),12);add(content,button("Manage all listings",false,()->showAdminListings("",0)),12);
        },()->add(content,button("Refresh account",false,this::showAccount),12));
    }
    private void showAdminAccounts(String search,int page){if(!canMove())return;if(!isAdmin()){showAccount();return;}reset("admin_accounts");add(content,text("Accounts & roles",27,INK,true),12);add(content,button("Back to admin dashboard",false,this::showAdmin),12);EditText find=input(content,"admin_search","Search names or emails",search,InputType.TYPE_CLASS_TEXT);add(content,button("Search accounts",false,()->showAdminAccounts(find.getText().toString(),0)),16);
        job(()->MarketApi.call("/api/admin/accounts?limit=20&offset="+page+"&q="+Uri.encode(search),"GET",null,secure.get("token")),response->{JSONArray accounts=response.getJSONArray("accounts");if(accounts.length()==0)add(content,text("No accounts found.",18,MUTED,false),12);
            for(int i=0;i<accounts.length();i++){JSONObject account=accounts.getJSONObject(i);LinearLayout panel=box();panel.setPadding(dp(14),dp(14),dp(14),dp(14));panel.setBackground(background(Color.WHITE,14,true));add(panel,text(account.optString("display_name"),21,INK,true),6);add(panel,text(account.optString("email"),15,MUTED,false),8);add(panel,text(roleLabel(account.optString("role"))+" · "+account.optString("account_status"),16,ORANGE,true),12);
                if(account.optString("id").equals(seller.optString("id")))add(panel,text("This is your admin account.",15,MUTED,false),6);
                else{add(panel,button("Change role",false,()->chooseRole(account,search,page)),10);boolean suspended=account.optString("account_status").equals("suspended");add(panel,button(suspended?"Restore account":"Suspend account",false,()->new AlertDialog.Builder(this).setTitle(suspended?"Restore this account?":"Suspend this account?").setMessage(suspended?"The person will be able to sign in again.":"The person will be signed out and their goods hidden from the market.").setNegativeButton("Cancel",null).setPositiveButton(suspended?"Restore":"Suspend",(dialog,which)->updateAccount(account,"account_status",suspended?"active":"suspended",search,page)).show()),0);}
                add(content,panel,14);
            }
            if(page>0)add(content,button("Previous accounts",false,()->showAdminAccounts(search,Math.max(0,page-20))),10);if(response.optBoolean("has_more"))add(content,button("Next accounts",false,()->showAdminAccounts(search,page+20)),10);
        },null);
    }
    private void chooseRole(JSONObject account,String search,int page){String[] roles={"user","seller","admin"},labels={"User: browse and contact sellers","Seller: post and manage own goods","Admin: manage accounts and listings"};new AlertDialog.Builder(this).setTitle("Choose account role").setItems(labels,(dialog,which)->new AlertDialog.Builder(this).setTitle("Assign "+roleLabel(roles[which])+" role?").setMessage(account.optString("email")+" will receive these permissions immediately.").setNegativeButton("Cancel",null).setPositiveButton("Confirm",(confirm,button)->updateAccount(account,"role",roles[which],search,page)).show()).setNegativeButton("Cancel",null).show();}
    private void updateAccount(JSONObject account,String key,String value,String search,int page){job(()->{JSONObject data=new JSONObject();data.put(key,value);return MarketApi.call("/api/admin/accounts/"+account.getString("id"),"PUT",data,secure.get("token"));},response->{toast("Account updated.");showAdminAccounts(search,page);},null);}
    private void showAdminListings(String search,int page){if(!canMove())return;if(!isAdmin()){showAccount();return;}reset("admin_listings");add(content,text("All listings",27,INK,true),12);add(content,button("Back to admin dashboard",false,this::showAdmin),12);EditText find=input(content,"admin_search","Search titles",search,InputType.TYPE_CLASS_TEXT);add(content,button("Search listings",false,()->showAdminListings(find.getText().toString(),0)),16);
        job(()->MarketApi.call("/api/admin/listings?limit=20&offset="+page+"&q="+Uri.encode(search),"GET",null,secure.get("token")),response->{JSONArray listings=response.getJSONArray("listings");if(listings.length()==0)add(content,text("No listings found.",18,MUTED,false),12);
            for(int i=0;i<listings.length();i++){JSONObject listing=listings.getJSONObject(i);LinearLayout panel=box();panel.setPadding(dp(14),dp(14),dp(14),dp(14));panel.setBackground(background(Color.WHITE,14,true));add(panel,text(listing.optString("title"),22,INK,true),6);add(panel,text(MarketRules.price(listing.optLong("price_minor"),listing.optString("currency"))+" · "+listing.optString("status"),18,ORANGE,true),8);add(panel,text(listing.optString("seller_name")+" · "+listing.optString("location"),15,MUTED,false),8);add(panel,text(listing.optString("description"),16,INK,false),12);add(panel,button("Change listing status",false,()->{String[] statuses={"active","sold","removed"},labels={"Available","Sold","Removed from market"};new AlertDialog.Builder(this).setTitle("Moderate listing").setItems(labels,(dialog,which)->new AlertDialog.Builder(this).setTitle("Change listing status?").setMessage("Set this listing to "+labels[which]+"?").setNegativeButton("Cancel",null).setPositiveButton("Confirm",(confirm,button)->moderateListing(listing,statuses[which],search,page)).show()).setNegativeButton("Cancel",null).show();}),0);add(content,panel,14);}
            if(page>0)add(content,button("Previous listings",false,()->showAdminListings(search,Math.max(0,page-20))),10);if(response.optBoolean("has_more"))add(content,button("Next listings",false,()->showAdminListings(search,page+20)),10);
        },null);
    }
    private void moderateListing(JSONObject listing,String status,String search,int page){job(()->{JSONObject data=new JSONObject();data.put("status",status);return MarketApi.call("/api/admin/listings/"+listing.getString("id"),"PUT",data,secure.get("token"));},response->{toast("Listing status updated.");showAdminListings(search,page);},null);}

    private void showSaved(){if(!canMove())return;if(!signedIn()){showSignIn("browse");return;}reset("saved");add(content,text("Saved goods",27,INK,true),14);job(()->MarketApi.call("/api/favorites","GET",null,secure.get("token")),response->{JSONArray items=response.getJSONArray("listings");if(items.length()==0)add(content,text("Save goods from a listing to find them here.",17,MUTED,false),12);for(int i=0;i<items.length();i++){JSONObject listing=items.getJSONObject(i);add(content,card(listing,false),10);add(content,button("Remove from saved goods",false,()->job(()->MarketApi.call("/api/favorites/"+listing.getString("id"),"DELETE",null,secure.get("token")),result->showSaved(),null)),16);}},null);}
    private void requestLiveCheck(JSONObject listing){job(()->{JSONObject data=new JSONObject();data.put("listing_id",listing.getString("id"));return MarketApi.call("/api/live-checks","POST",data,secure.get("token"));},response->{toast("Live check requested. Ask the seller to open Live checks in their app.");showLiveChecks();},null);}
    private void showLiveChecks(){if(!canMove())return;if(!signedIn()){showSignIn("browse");return;}reset("live_checks");add(content,text("Live goods checks",27,INK,true),10);add(content,text("The seller shows the goods through their camera. Confirm your inspection before preparing a payment.",16,MUTED,false),14);add(content,button("Refresh requests",false,this::showLiveChecks),16);
        job(()->MarketApi.call("/api/live-checks","GET",null,secure.get("token")),response->{JSONArray checks=response.getJSONArray("checks");if(checks.length()==0)add(content,text("Open a listing and tap See the goods live to request an inspection.",17,MUTED,false),12);
            for(int i=0;i<checks.length();i++){JSONObject check=checks.getJSONObject(i);boolean buyer=check.optString("buyer_id").equals(seller.optString("id"));String status=check.optString("status");LinearLayout panel=box();panel.setPadding(dp(14),dp(14),dp(14),dp(14));panel.setBackground(background(Color.WHITE,14,true));add(panel,text(check.optString("title"),22,INK,true),8);add(panel,text((buyer?"Seller: "+check.optString("seller_name"):"Buyer: "+check.optString("buyer_name"))+" · "+status.replace('_',' '),16,MUTED,false),12);
                if(status.equals("requested")){if(buyer)add(panel,text("Waiting for the seller to accept. Ask them to check their requests.",16,MUTED,false),10);else{add(panel,button("Accept live check",true,()->respondLive(check,"accepted")),10);add(panel,button("Decline",false,()->respondLive(check,"declined")),10);}}
                if(status.equals("accepted")){add(panel,button("Join live video",true,()->joinLive(check)),10);if(buyer)add(panel,button("I have inspected the goods",false,()->completeLive(check)),10);}
                if(status.equals("ended")&&buyer)add(panel,button("Confirm my inspection",true,()->completeLive(check)),10);
                if(status.equals("checked")&&buyer&&check.optString("listing_status").equals("active")){add(panel,text("You confirmed your inspection.",16,MUTED,false),10);add(panel,button("Prepare EcoCash payment",true,()->prepareOrder(check)),10);}
                add(content,panel,16);
            }
        },null);
    }
    private void respondLive(JSONObject check,String status){job(()->{JSONObject data=new JSONObject();data.put("status",status);return MarketApi.call("/api/live-checks/"+check.getString("id")+"/respond","POST",data,secure.get("token"));},response->showLiveChecks(),null);}
    private void joinLive(JSONObject check){job(()->MarketApi.call("/api/live-checks/"+check.getString("id")+"/ticket","POST",null,secure.get("token")),response->openUrl(response.getString("url")),null);}
    private void completeLive(JSONObject check){new AlertDialog.Builder(this).setTitle("Have you inspected the goods?").setMessage("Confirm after viewing the seller’s live video. This records your own inspection.").setNegativeButton("Not yet",null).setPositiveButton("Confirm inspection",(dialog,which)->job(()->MarketApi.call("/api/live-checks/"+check.getString("id")+"/complete","POST",null,secure.get("token")),response->showLiveChecks(),null)).show();}
    private void prepareOrder(JSONObject check){String request=java.util.UUID.randomUUID().toString();job(()->{JSONObject data=new JSONObject();data.put("live_check_id",check.getString("id"));data.put("client_request_id",request);data.put("expected_price_minor",check.getLong("price_minor"));data.put("expected_currency",check.getString("currency"));return MarketApi.call("/api/orders","POST",data,secure.get("token"));},response->showOrder(response.getJSONObject("order").getString("id")),null);}
    private String paymentLabel(String state){return state.equals("seller_confirmed")?"Seller confirmed payment":state.equals("buyer_reported")?"Waiting for seller confirmation":state.equals("cancelled")?"Cancelled":"Awaiting EcoCash transfer";}
    private void showOrders(){if(!canMove())return;if(!signedIn()){showSignIn("browse");return;}reset("orders");add(content,text("Purchases & receipts",27,INK,true),12);add(content,button("Refresh purchases",false,this::showOrders),14);
        job(()->MarketApi.call("/api/orders","GET",null,secure.get("token")),response->{JSONArray orders=response.getJSONArray("orders");if(orders.length()==0)add(content,text("Inspect goods live, then prepare a payment to see a purchase here.",17,MUTED,false),12);for(int i=0;i<orders.length();i++){JSONObject order=orders.getJSONObject(i);LinearLayout panel=box();panel.setPadding(dp(14),dp(14),dp(14),dp(14));panel.setBackground(background(Color.WHITE,14,true));add(panel,text(order.optString("title"),22,INK,true),8);add(panel,text(MarketRules.price(order.optLong("price_minor"),order.optString("currency")),21,ORANGE,true),8);add(panel,text(paymentLabel(order.optString("payment_state")),16,MUTED,false),12);add(panel,button("View purchase",false,()->showOrder(order.optString("id"))),0);add(content,panel,14);}},null);
    }
    private void showOrder(String id){if(!canMove())return;reset("order");add(content,text("Purchase details",27,INK,true),12);job(()->MarketApi.call("/api/orders/"+id,"GET",null,secure.get("token")),response->{JSONObject order=response.getJSONObject("order");String state=order.optString("payment_state");boolean buyer=order.optString("buyer_id").equals(seller.optString("id"));add(content,text(order.optString("title"),25,INK,true),10);add(content,text(MarketRules.price(order.optLong("price_minor"),order.optString("currency")),27,ORANGE,true),12);add(content,text("Buyer: "+order.optString("buyer_name")+"\nSeller: "+order.optString("seller_name"),16,MUTED,false),12);add(content,text(paymentLabel(state),19,INK,true),14);add(content,text("EcoCash recipient: "+order.optString("payee_phone"),17,INK,true),12);
            if(buyer&&(state.equals("awaiting_payment")||state.equals("buyer_reported"))){add(content,text("Pay the seller directly in EcoCash using the amount and currency above. NyazuraMusika does not send money or collect your PIN.",16,MUTED,false),14);add(content,button("Copy receiving number",false,()->{String number=order.optString("payee_phone");if(number.startsWith("+263"))number="0"+number.substring(4);android.content.ClipboardManager clipboard=(android.content.ClipboardManager)getSystemService(CLIPBOARD_SERVICE);clipboard.setPrimaryClip(android.content.ClipData.newPlainText("EcoCash recipient",number));toast("Receiving number copied.");}),12);add(content,button("Open EcoCash Super App",true,this::openEcoCash),12);add(content,button("Use EcoCash *151#",false,()->{try{startActivity(new Intent(Intent.ACTION_DIAL,Uri.parse("tel:"+Uri.encode("*151#"))));}catch(Exception e){toast("Open EcoCash or dial *151# on your phone.");}}),14);
                EditText reference=input(content,"payment_reference","EcoCash transaction reference",order.optString("payment_reference"),InputType.TYPE_CLASS_TEXT);add(content,button("Submit payment reference",false,()->{String value=reference.getText().toString().trim();if(value.length()<4||value.length()>80){error("Enter the transaction reference from your EcoCash confirmation.");return;}job(()->{JSONObject data=new JSONObject();data.put("payment_reference",value);return MarketApi.call("/api/orders/"+id+"/report","POST",data,secure.get("token"));},result->showOrder(id),null);}),12);add(content,text("A submitted reference is not proof of payment. The seller checks their wallet before confirming.",14,MUTED,false),14);
            }
            if(!buyer&&state.equals("buyer_reported")){add(content,text("Buyer’s EcoCash reference: "+order.optString("payment_reference"),17,INK,true),12);add(content,button("I received this payment",true,()->new AlertDialog.Builder(this).setTitle("Confirm money received?").setMessage("Check your EcoCash wallet for this recipient number, amount, currency and transaction reference. Confirm only when the money is received.").setNegativeButton("Not received",null).setPositiveButton("Confirm received",(dialog,which)->job(()->{JSONObject data=new JSONObject();data.put("checked_wallet",true);return MarketApi.call("/api/orders/"+id+"/confirm","POST",data,secure.get("token"));},result->showOrder(id),null)).show()),12);}
            if(state.equals("seller_confirmed")){add(content,text("Confirmed by the seller. This payment has not been independently verified by EcoCash.",16,MUTED,false),14);add(content,button("Print or save receipt",true,()->job(()->MarketApi.call("/api/orders/"+id+"/receipt","GET",null,secure.get("token")),result->ReceiptPrinter.print(this,result.getJSONObject("receipt")),null)),12);}
            if(state.equals("awaiting_payment"))add(content,button("Cancel unpaid purchase",false,()->new AlertDialog.Builder(this).setTitle("Cancel this unpaid purchase?").setMessage("Cancel only if you have not transferred money to the seller.").setNegativeButton("Keep purchase",null).setPositiveButton("Cancel purchase",(dialog,which)->job(()->MarketApi.call("/api/orders/"+id+"/cancel","POST",null,secure.get("token")),result->showOrder(id),null)).show()),12);
            add(content,button("Refresh purchase",false,()->showOrder(id)),12);add(content,button("Back to purchases",false,this::showOrders),12);
        },null);
    }
    private void openEcoCash(){Intent intent=getPackageManager().getLaunchIntentForPackage("com.ecocash.superapp");if(intent!=null)try{startActivity(intent);return;}catch(Exception ignored){}openUrl("https://play.google.com/store/apps/details?id=com.ecocash.superapp");}

    private void showForm(JSONObject record,JSONObject draft){if(!canMove())return;if(!canSell()){showSell();return;}reset("form");editing=record;imageId=record==null?"":record.optString("image_id","");if(imageId.equals("null"))imageId="";photoJpeg=null;photoUri="";photoLoading=false;JSONObject data=draft!=null?draft:record!=null?record:new JSONObject();
        add(content,text(record==null?"Sell goods":"Edit your listing",27,INK,true),14);input(content,"title","What are you selling?",data.optString("title"),InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        EditText description=input(content,"description","Description (at least 10 characters)",data.optString("description"),InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_FLAG_MULTI_LINE|InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);description.setSingleLine(false);description.setMinLines(3);description.setGravity(Gravity.TOP);description.setHint("Condition, size and what the buyer should know");
        EditText price=input(content,"price","Price",data.has("price_minor")?MarketRules.priceText(data.optLong("price_minor")):"",InputType.TYPE_CLASS_NUMBER|InputType.TYPE_NUMBER_FLAG_DECIMAL);price.setHint("For example, 5.00");
        currencyPicker=picker(content,"Currency",CURRENCIES,data.optString("currency","USD"));categoryPicker=picker(content,"Category",CATEGORIES,data.optString("category","Produce"));conditionPicker=picker(content,"Condition",CONDITIONS,data.optString("condition","Used"));input(content,"location","Collection area",data.optString("location","Nyazura"),InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_FLAG_CAP_WORDS);
        selectedPhoto=new ImageView(this);selectedPhoto.setContentDescription("Selected product photo");selectedPhoto.setScaleType(ImageView.ScaleType.CENTER_CROP);selectedPhoto.setVisibility(View.GONE);content.addView(selectedPhoto,new LinearLayout.LayoutParams(-1,dp(180)));
        if(!imageId.isEmpty()){selectedPhoto.setVisibility(View.VISIBLE);fetchPhoto("/api/images/"+imageId,selectedPhoto,true);}add(content,button("Choose a product photo",false,()->{if(saving){toast("Please wait for the listing to finish saving.");return;}Intent pick=new Intent(Intent.ACTION_OPEN_DOCUMENT);pick.setType("image/*");pick.addCategory(Intent.CATEGORY_OPENABLE);pick.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);try{startActivityForResult(pick,PHOTO_REQUEST);}catch(Exception e){toast("No photo picker is available on this device.");}}),12);
        add(content,text("Your seller details and collection area will be visible to buyers.",14,MUTED,false),12);Button save=button(record==null?"Post goods for sale":"Save changes",true,()->{});save.setOnClickListener(v->saveListing(save));add(content,save,12);add(content,button("Cancel",false,this::showMy),12);
    }
    private IllegalArgumentException invalidProductField(String key,String message){EditText field=fields.get(key);if(field!=null){field.setError(message);field.requestFocus();}return new IllegalArgumentException(message);}
    private JSONObject formData(boolean validate)throws Exception {JSONObject data=new JSONObject();String title=fields.get("title").getText().toString().trim(),description=fields.get("description").getText().toString().trim(),location=fields.get("location").getText().toString().trim();if(validate){for(String key:new String[]{"title","description","price","location"})fields.get(key).setError(null);if(title.length()<3||title.length()>100)throw invalidProductField("title","Enter a title containing 3–100 characters.");if(description.length()<10||description.length()>2000)throw invalidProductField("description","Enter a description containing 10–2000 characters.");if(location.length()<2||location.length()>80)throw invalidProductField("location","Enter a collection area containing 2–80 characters.");}
        data.put("title",title);data.put("description",description);data.put("location",location);String price=fields.get("price").getText().toString();if(validate||!price.isEmpty()){try{data.put("price_minor",MarketRules.priceMinor(price));}catch(Exception e){if(validate)throw invalidProductField("price",e.getMessage()==null?"Enter a positive price with at most two decimal places.":e.getMessage());}}
        data.put("category",categoryPicker.getSelectedItem().toString());data.put("currency",currencyPicker.getSelectedItem().toString());data.put("condition",conditionPicker.getSelectedItem().toString());data.put("image_id",imageId.isEmpty()?JSONObject.NULL:imageId);data.put("status",editing==null?"active":editing.optString("status","active"));if(editing!=null)data.put("id",editing.optString("id"));return data;
    }
    private void postingMessage(String title,String message){String detail=message==null||message.isEmpty()?"Please check your product details and try again.":message;error(detail);new AlertDialog.Builder(this).setTitle(title).setMessage(detail).setPositiveButton("OK",null).show();}
    private void saveListing(Button button){
        if(saving){toast("Your product is being posted. Please wait.");return;}
        View focused=getCurrentFocus();InputMethodManager keyboard=(InputMethodManager)getSystemService(INPUT_METHOD_SERVICE);if(focused!=null&&keyboard!=null)keyboard.hideSoftInputFromWindow(focused.getWindowToken(),0);
        if(photoLoading){postingMessage("Photo is still loading","Please wait for your photo to finish loading, then tap Post again.");return;}
        try{
            JSONObject data=formData(true);final byte[] jpeg=photoJpeg;final JSONObject old=editing;final String token=secure.get("token");final String label=old==null?"Post goods for sale":"Save changes";
            saving=true;button.setEnabled(false);button.setText(old==null?"Posting your product…":"Saving changes…");
            job(()->{if(jpeg!=null){String uploaded=MarketApi.upload(jpeg,token);data.put("image_id",uploaded);}return MarketApi.call(old==null?"/api/listings":"/api/listings/"+old.getString("id"),old==null?"POST":"PUT",data,token);},result->{saving=false;toast(old==null?"Your goods are listed.":"Listing updated.");showMy();},()->{saving=false;button.setEnabled(true);button.setText(label);postingMessage("Posting could not finish",notice.getText().toString());});
        }catch(Exception e){postingMessage("Check your product details",e.getMessage());}
    }
    @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request==PHOTO_REQUEST&&result==RESULT_OK&&data!=null&&data.getData()!=null){Uri uri=data.getData();try{getContentResolver().takePersistableUriPermission(uri,Intent.FLAG_GRANT_READ_URI_PERMISSION);}catch(Exception ignored){}photoUri=uri.toString();loadSelectedPhoto(uri);}}
    private void loadSelectedPhoto(Uri uri){final long version=epoch;photoLoading=true;busy(true);executor.execute(()->{try{BitmapFactory.Options bounds=new BitmapFactory.Options();bounds.inJustDecodeBounds=true;try(InputStream input=getContentResolver().openInputStream(uri)){BitmapFactory.decodeStream(input,null,bounds);}if(bounds.outWidth<1||bounds.outHeight<1)throw new IllegalArgumentException("Choose a readable photo.");BitmapFactory.Options options=new BitmapFactory.Options();options.inSampleSize=1;while(Math.max(bounds.outWidth,bounds.outHeight)/options.inSampleSize>1400)options.inSampleSize*=2;Bitmap bitmap;try(InputStream input=getContentResolver().openInputStream(uri)){bitmap=BitmapFactory.decodeStream(input,null,options);}if(bitmap==null)throw new IllegalArgumentException("Choose a readable photo.");
            int orientation=ExifInterface.ORIENTATION_NORMAL;try(InputStream input=getContentResolver().openInputStream(uri)){orientation=new ExifInterface(input).getAttributeInt(ExifInterface.TAG_ORIENTATION,ExifInterface.ORIENTATION_NORMAL);}catch(Exception ignored){}Matrix matrix=new Matrix();if(orientation==ExifInterface.ORIENTATION_ROTATE_90)matrix.postRotate(90);else if(orientation==ExifInterface.ORIENTATION_ROTATE_180)matrix.postRotate(180);else if(orientation==ExifInterface.ORIENTATION_ROTATE_270)matrix.postRotate(270);else if(orientation==ExifInterface.ORIENTATION_FLIP_HORIZONTAL)matrix.postScale(-1,1);else if(orientation==ExifInterface.ORIENTATION_FLIP_VERTICAL)matrix.postScale(1,-1);Bitmap rotated=Bitmap.createBitmap(bitmap,0,0,bitmap.getWidth(),bitmap.getHeight(),matrix,true);float ratio=Math.min(1f,1024f/Math.max(rotated.getWidth(),rotated.getHeight()));Bitmap scaled=Bitmap.createScaledBitmap(rotated,Math.max(1,Math.round(rotated.getWidth()*ratio)),Math.max(1,Math.round(rotated.getHeight()*ratio)),true);ByteArrayOutputStream output=new ByteArrayOutputStream();scaled.compress(Bitmap.CompressFormat.JPEG,78,output);byte[] jpeg=output.toByteArray();if(jpeg.length>800_000)throw new IllegalArgumentException("Choose a smaller photo.");
            ui.post(()->{if(epoch==version&&!isDestroyed()){busy(false);photoLoading=false;photoJpeg=jpeg;selectedPhoto.setImageBitmap(scaled);selectedPhoto.setVisibility(View.VISIBLE);}});
        }catch(Exception e){ui.post(()->{if(epoch==version){busy(false);photoLoading=false;error("That photo could not be opened. Please choose another.");}});}});}
    private void openUrl(String value){try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(value)));}catch(Exception e){toast("Install a browser to open this link.");}}
}
