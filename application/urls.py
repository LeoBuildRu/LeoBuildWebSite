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
    path('get-item-info/', views.get_item_info, name='get_item_info'),
    path('get-cart-info/', views.get_cart_info, name='get_cart_info'),
    path('search/', views.search_product, name='search_product'),
    path('save_scene/', views.save_scene, name='save_scene'),
    path('scene.babylon', views.my_json_view, name='my_json'),
]