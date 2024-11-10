from django.urls import path
from . import views

urlpatterns = [
    path('', views.index_page),
    path('builder/', views.builder_page),
    path('add_to_cart/', views.add_to_cart, name='add_to_cart'),
    path('cart/', views.cart_view, name='cart_view'),
    path('api/compiledJsonProducts/', views.get_products, name='get_products'),
    path('get-item-info/', views.get_item_info, name='get_item_info'),
    path('get-cart-info/', views.get_cart_info, name='get_cart_info'),
    path('get_company/', views.get_company, name='get_company'),
    path('search/', views.search_product, name='search_product'),
]