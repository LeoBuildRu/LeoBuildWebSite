from django.urls import path
from . import views

urlpatterns = [
    path('', views.index_page),
    path('builder/', views.builder_page),
    path('api/compiledJsonCompanys/', views.get_companys, name='get_companys'),
    path('api/compiledJsonClasses/', views.get_classes, name='get_classes'),
    path('api/compiledJsonProducts/', views.get_products, name='get_products'),
    path('add_to_cart/', views.add_to_cart, name='add_to_cart'),
    path('remove_from_cart/', views.remove_from_cart, name='remove_from_cart'),
    path('cart/', views.cart_view, name='cart_view'),
    path('api/proxy-roboflow/', views.proxy_roboflow_workflow, name='proxy_roboflow'),
    path('get-item-info/', views.get_item_info, name='get_item_info'),
    path('get-cart-info/', views.get_cart_info, name='get_cart_info'),
    path('search/', views.search_product, name='search_product'),
    path('save_scene/', views.save_scene, name='save_scene'),
    path('scene.babylon', views.my_json_view, name='my_json'),

    # ─── Accounts (auth) ──────────────────────────────────────────────
    path('accounts/login/',    views.login_view,    name='login'),
    path('accounts/register/', views.register_view, name='register'),
    path('accounts/logout/',   views.logout_view,   name='logout'),
    path('accounts/profile/',  views.profile_view,  name='profile'),

    # ─── Saved scenes API ─────────────────────────────────────────────
    path('api/scenes/save/',                  views.scenes_save,   name='scenes_save'),
    path('api/scenes/list/',                  views.scenes_list,   name='scenes_list'),
    path('api/scenes/<int:scene_id>/',        views.scenes_get,    name='scenes_get'),
    path('api/scenes/<int:scene_id>/delete/', views.scenes_delete, name='scenes_delete'),
    # HTML-форма удаления из профиля → 302 на /accounts/profile/.
    path('accounts/profile/scene/<int:scene_id>/delete/',
         views.scenes_delete_form, name='scenes_delete_form'),

    # Share: ленивый generate-or-return токена (требует auth, владелец).
    path('api/scenes/<int:scene_id>/share/', views.scenes_share,  name='scenes_share'),
    # Public viewer: любой с токеном получает scene.data.
    path('api/scenes/shared/<uuid:token>/',  views.scenes_public, name='scenes_public'),
]